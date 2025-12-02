import Peer, { DataConnection } from 'peerjs';

// File chunk size: 256KB
const CHUNK_SIZE = 256 * 1024;

export interface FileMetadata {
    name: string;
    size: number;
    type: string;
    totalChunks: number;
}

export interface TransferProgress {
    transferred: number;
    total: number;
    percentage: number;
    speed: number; // bytes per second
}

export interface ClientInfo {
    id: string;
    connection: DataConnection;
    progress: TransferProgress;
    startTime: number;
    completionResolve?: () => void;
}

export type ConnectionStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'transferring'
    | 'completed'
    | 'error';

export class P2PFileTransfer {
    private peer: Peer | null = null;
    private connections: Map<string, ClientInfo> = new Map(); // Store multiple connections
    private onStatusChange?: (status: ConnectionStatus) => void;
    private onProgressChange?: (clientId: string, progress: TransferProgress) => void;
    private onClientConnect?: (clientId: string) => void;
    private onClientDisconnect?: (clientId: string) => void;
    private onFileReceived?: (file: File) => void;
    private onError?: (error: string) => void;
    private overallStatus: ConnectionStatus = 'idle';
    private pendingFile: File | null = null; // Store file for automatic sending
    private lastProgressUpdate = 0;

    constructor() { }

    // Initialize as sender (creates a new peer ID)
    async initSender(
        onStatusChange: (status: ConnectionStatus) => void,
        onError: (error: string) => void,
        onClientConnect?: (clientId: string) => void,
        onClientDisconnect?: (clientId: string) => void
    ): Promise<string> {
        this.onStatusChange = onStatusChange;
        this.onError = onError;
        this.onClientConnect = onClientConnect;
        this.onClientDisconnect = onClientDisconnect;

        return new Promise((resolve, reject) => {
            try {
                // Create peer with custom ID
                const peerId = this.generateRoomId();

                this.peer = new Peer(peerId, {
                    config: {
                        iceServers: [
                            { urls: 'stun:global.stun.twilio.com:3478' },
                            { urls: 'stun:stun.miwifi.com:3478' },
                            { urls: 'stun:stun.qq.com:3478' },
                        ]
                    }
                });

                this.peer.on('open', (id) => {
                    console.log('Sender peer opened with ID:', id);
                    this.updateOverallStatus('idle');
                    resolve(id);
                });

                this.peer.on('connection', (conn) => {
                    console.log('Incoming connection from:', conn.peer);
                    this.setupConnection(conn);
                });

                this.peer.on('error', (err) => {
                    console.error('Peer error:', err);
                    this.onError?.(err.message);
                    this.updateOverallStatus('error');
                    reject(err);
                });

            } catch (error: any) {
                reject(error);
            }
        });
    }

    // Initialize as receiver (connects to an existing peer ID)
    async initReceiver(
        roomId: string,
        onStatusChange: (status: ConnectionStatus) => void,
        onProgressChange: (progress: TransferProgress) => void,
        onFileReceived: (file: File) => void,
        onError: (error: string) => void
    ): Promise<void> {
        this.onStatusChange = onStatusChange;
        this.onProgressChange = (clientId, progress) => onProgressChange(progress); // Single client, ignore clientId
        this.onFileReceived = onFileReceived;
        this.onError = onError;

        return new Promise((resolve, reject) => {
            try {
                this.updateOverallStatus('connecting');

                // Create a temporary peer
                this.peer = new Peer({
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' },
                            { urls: 'stun:stun.stunprotocol.org:3478' },
                            { urls: 'stun:stun.voipawesome.com:3478' },
                            { urls: 'stun:stun.nextcloud.com:3478' },
                            { urls: 'stun:stun.miwifi.com:3478' },
                            { urls: 'stun:stun.qq.com:3478' },
                            
                        ]
                    }
                });

                this.peer.on('open', () => {
                    console.log('Receiver peer opened, connecting to:', roomId);

                    // Connect to the sender
                    const conn = this.peer!.connect(roomId, {
                        reliable: true,
                        serialization: 'binary'
                    });

                    this.setupConnection(conn);
                    resolve();
                });

                this.peer.on('error', (err) => {
                    console.error('Peer error:', err);
                    this.onError?.(err.message);
                    this.updateOverallStatus('error');
                    reject(err);
                });

            } catch (error: any) {
                reject(error);
            }
        });
    }

    private setupConnection(conn: DataConnection) {
        conn.on('open', () => {
            console.log('Data connection opened with:', conn.peer);

            // For sender, add client to connections map
            if (this.connections !== undefined) {
                const clientInfo: ClientInfo = {
                    id: conn.peer,
                    connection: conn,
                    progress: {
                        transferred: 0,
                        total: 0,
                        percentage: 0,
                        speed: 0
                    },
                    startTime: Date.now()
                };

                this.connections.set(conn.peer, clientInfo);
                this.onClientConnect?.(conn.peer);
            }

            // Only update status to connected if we're not already transferring
            if (this.overallStatus !== 'transferring' && this.overallStatus !== 'completed') {
                this.updateOverallStatus('connected');
            }
        });

        conn.on('data', (data) => {
            this.handleIncomingData(data, conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Connection error with', conn.peer, ':', err);
            this.connections.delete(conn.peer);
            this.onClientDisconnect?.(conn.peer);
            this.onError?.(err.message);

            // Update status if no connections left
            if (this.connections.size === 0 && this.overallStatus !== 'completed') {
                this.updateOverallStatus('error');
            }
        });

        conn.on('close', () => {
            console.log('Connection closed with:', conn.peer);
            this.connections.delete(conn.peer);
            this.onClientDisconnect?.(conn.peer);

            // Update status if no connections left
            if (this.connections.size === 0 && this.overallStatus !== 'completed') {
                this.updateOverallStatus('idle');
            }
        });
    }

    // Send file through P2P connection to connected clients
    async sendFile(file: File, targetClientIds?: string[]): Promise<void> {
        // Determine target clients
        const targets = targetClientIds
            ? targetClientIds.map(id => this.connections.get(id)).filter((c): c is ClientInfo => c !== undefined)
            : Array.from(this.connections.values());

        if (targets.length === 0) {
            if (!targetClientIds) {
                // Only store as pending if we were trying to broadcast to everyone and no one was there
                this.pendingFile = file;
                throw new Error('No active connections. File will be sent when clients connect.');
            }
            return;
        }

        this.updateOverallStatus('transferring');

        const metadata: FileMetadata = {
            name: file.name,
            size: file.size,
            type: file.type,
            totalChunks: Math.ceil(file.size / CHUNK_SIZE)
        };

        // Send metadata to targets
        targets.forEach(client => {
            if (client.connection.open) {
                client.connection.send({
                    type: 'metadata',
                    data: metadata
                });

                // Reset progress for this client
                client.progress = {
                    transferred: 0,
                    total: file.size,
                    percentage: 0,
                    speed: 0
                };
                client.startTime = Date.now();
            }
        });

        // Wait a bit for metadata to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send file in chunks
        let offset = 0;
        let chunkIndex = 0;
        const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16MB limit

        // Create completion promises for all targets
        const completionPromises = targets.map(client => {
            return new Promise<void>(resolve => {
                client.completionResolve = resolve;
            });
        });

        while (offset < file.size) {
            // Check backpressure
            let canSend = true;
            for (const client of targets) {
                if (!client.connection.open) continue;
                // Access underlying RTCDataChannel to check buffer
                const dc = (client.connection as any).dataChannel as RTCDataChannel;
                if (dc && dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                    canSend = false;
                    break;
                }
            }

            if (!canSend) {
                // Wait for buffer to drain
                await new Promise(resolve => setTimeout(resolve, 5));
                continue;
            }

            const chunk = file.slice(offset, offset + CHUNK_SIZE);
            const arrayBuffer = await chunk.arrayBuffer();

            // Send chunk to targets
            targets.forEach(client => {
                // Only send if connection is still open
                if (client.connection.open) {
                    client.connection.send({
                        type: 'chunk',
                        index: chunkIndex,
                        data: arrayBuffer
                    });
                }
            });

            offset += CHUNK_SIZE;
            chunkIndex++;
        }

        // Send completion signal to targets
        targets.forEach(client => {
            if (client.connection.open) {
                client.connection.send({ type: 'complete' });
            }
        });

        // Wait for all clients to acknowledge completion
        await Promise.all(completionPromises);

        this.updateOverallStatus('completed');

        if (!targetClientIds) {
            this.pendingFile = null; // Clear pending file only if it was a broadcast
        }
    }

    // Get list of connected clients
    getConnectedClients(): ClientInfo[] {
        return Array.from(this.connections.values());
    }

    // Receiving file data
    private receivedChunks: ArrayBuffer[] = [];
    private fileMetadata: FileMetadata | null = null;
    private receivedChunkCount = 0;
    private receiveStartTime = 0;

    private handleIncomingData(data: any, peerId: string) {
        if (data.type === 'metadata') {
            console.log('Received file metadata:', data.data);
            this.fileMetadata = data.data;
            this.receivedChunks = [];
            this.receivedChunkCount = 0;
            this.receiveStartTime = Date.now();
            this.updateOverallStatus('transferring');
        }
        else if (data.type === 'chunk') {
            this.receivedChunks[data.index] = data.data;
            this.receivedChunkCount++;

            if (this.fileMetadata && this.onProgressChange) {
                const transferred = this.receivedChunkCount * CHUNK_SIZE;
                const elapsed = (Date.now() - this.receiveStartTime) / 1000;
                const speed = elapsed > 0 ? transferred / elapsed : 0;

                const progress: TransferProgress = {
                    transferred: Math.min(transferred, this.fileMetadata.size),
                    total: this.fileMetadata.size,
                    percentage: (this.receivedChunkCount / this.fileMetadata.totalChunks) * 100,
                    speed
                };

                // For receiver, we don't have a client ID, so we pass an empty string
                // Throttle progress updates to max 20fps (50ms)
                const now = Date.now();
                if (now - this.lastProgressUpdate > 50 || this.receivedChunkCount === this.fileMetadata.totalChunks) {
                    this.onProgressChange('', progress);
                    this.lastProgressUpdate = now;
                }

                // Send ACK to sender every 4 chunks (approx 1MB with 256KB chunks)
                if (this.receivedChunkCount % 4 === 0) {
                    const sender = this.connections.get(peerId);
                    if (sender && sender.connection.open) {
                        sender.connection.send({
                            type: 'progress_ack',
                            transferred: progress.transferred
                        });
                    }
                }
            }
        }
        else if (data.type === 'complete') {
            console.log('File transfer complete');
            this.assembleFile();

            // Send completion ACK
            const sender = this.connections.get(peerId);
            if (sender && sender.connection.open) {
                sender.connection.send({ type: 'transfer_complete_ack' });
            }
        }
        else if (data.type === 'progress_ack') {
            // Handle progress ACK from receiver
            const client = this.connections.get(peerId);
            if (client) {
                client.progress.transferred = data.transferred;
                const elapsed = (Date.now() - client.startTime) / 1000;
                client.progress.speed = elapsed > 0 ? client.progress.transferred / elapsed : 0;
                // Recalculate percentage based on total size (which we know)
                client.progress.percentage = (client.progress.transferred / client.progress.total) * 100;

                this.onProgressChange?.(client.id, client.progress);
            }
        }
        else if (data.type === 'transfer_complete_ack') {
            // Handle completion ACK from receiver
            const client = this.connections.get(peerId);
            if (client && client.completionResolve) {
                // Ensure progress is 100%
                client.progress.transferred = client.progress.total;
                client.progress.percentage = 100;
                this.onProgressChange?.(client.id, client.progress);

                client.completionResolve();
            }
        }
    }

    private assembleFile() {
        if (!this.fileMetadata) return;

        // Combine all chunks
        const blob = new Blob(this.receivedChunks, { type: this.fileMetadata.type });
        const file = new File([blob], this.fileMetadata.name, {
            type: this.fileMetadata.type
        });

        this.onFileReceived?.(file);
        this.updateOverallStatus('completed');

        // Clear received data
        this.receivedChunks = [];
        this.fileMetadata = null;
        this.receivedChunkCount = 0;
    }

    // Generate a random room ID
    private generateRoomId(): string {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Update overall status and notify
    private updateOverallStatus(status: ConnectionStatus) {
        this.overallStatus = status;
        this.onStatusChange?.(status);
    }

    // Clean up connections
    destroy() {
        this.connections.forEach(client => {
            client.connection.close();
        });
        this.connections.clear();
        this.pendingFile = null;

        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }
}

// Format bytes to human readable
export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format speed
export function formatSpeed(bytesPerSecond: number): string {
    return formatBytes(bytesPerSecond) + '/s';
}