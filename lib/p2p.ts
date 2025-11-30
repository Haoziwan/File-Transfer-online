import Peer, { DataConnection } from 'peerjs';

// File chunk size: 16KB
const CHUNK_SIZE = 16 * 1024;

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

export type ConnectionStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'transferring'
    | 'completed'
    | 'error';

export class P2PFileTransfer {
    private peer: Peer | null = null;
    private connection: DataConnection | null = null;
    private onStatusChange?: (status: ConnectionStatus) => void;
    private onProgressChange?: (progress: TransferProgress) => void;
    private onFileReceived?: (file: File) => void;
    private onError?: (error: string) => void;

    constructor() { }

    // Initialize as sender (creates a new peer ID)
    async initSender(
        onStatusChange: (status: ConnectionStatus) => void,
        onError: (error: string) => void
    ): Promise<string> {
        this.onStatusChange = onStatusChange;
        this.onError = onError;

        return new Promise((resolve, reject) => {
            try {
                // Create peer with custom ID
                const peerId = this.generateRoomId();

                this.peer = new Peer(peerId, {
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:global.stun.twilio.com:3478' }
                        ]
                    }
                });

                this.peer.on('open', (id) => {
                    console.log('Sender peer opened with ID:', id);
                    this.onStatusChange?.('idle');
                    resolve(id);
                });

                this.peer.on('connection', (conn) => {
                    console.log('Incoming connection from:', conn.peer);
                    this.connection = conn;
                    this.setupConnection();
                });

                this.peer.on('error', (err) => {
                    console.error('Peer error:', err);
                    this.onError?.(err.message);
                    this.onStatusChange?.('error');
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
        this.onProgressChange = onProgressChange;
        this.onFileReceived = onFileReceived;
        this.onError = onError;

        return new Promise((resolve, reject) => {
            try {
                this.onStatusChange('connecting');

                // Create a temporary peer
                this.peer = new Peer({
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:global.stun.twilio.com:3478' }
                        ]
                    }
                });

                this.peer.on('open', () => {
                    console.log('Receiver peer opened, connecting to:', roomId);

                    // Connect to the sender
                    this.connection = this.peer!.connect(roomId, {
                        reliable: true,
                        serialization: 'binary'
                    });

                    this.setupConnection();
                    resolve();
                });

                this.peer.on('error', (err) => {
                    console.error('Peer error:', err);
                    this.onError?.(err.message);
                    this.onStatusChange?.('error');
                    reject(err);
                });

            } catch (error: any) {
                reject(error);
            }
        });
    }

    private setupConnection() {
        if (!this.connection) return;

        this.connection.on('open', () => {
            console.log('Data connection opened');
            this.onStatusChange?.('connected');
        });

        this.connection.on('data', (data) => {
            this.handleIncomingData(data);
        });

        this.connection.on('error', (err) => {
            console.error('Connection error:', err);
            this.onError?.(err.message);
            this.onStatusChange?.('error');
        });

        this.connection.on('close', () => {
            console.log('Connection closed');
        });
    }

    // Send file through P2P connection
    async sendFile(file: File): Promise<void> {
        if (!this.connection || this.connection.open === false) {
            throw new Error('No active connection');
        }

        this.onStatusChange?.('transferring');

        const metadata: FileMetadata = {
            name: file.name,
            size: file.size,
            type: file.type,
            totalChunks: Math.ceil(file.size / CHUNK_SIZE)
        };

        // Send metadata first
        this.connection.send({
            type: 'metadata',
            data: metadata
        });

        // Wait a bit for metadata to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send file in chunks
        let offset = 0;
        let chunkIndex = 0;
        const startTime = Date.now();

        while (offset < file.size) {
            const chunk = file.slice(offset, offset + CHUNK_SIZE);
            const arrayBuffer = await chunk.arrayBuffer();

            this.connection.send({
                type: 'chunk',
                index: chunkIndex,
                data: arrayBuffer
            });

            offset += CHUNK_SIZE;
            chunkIndex++;

            // Calculate progress
            const transferred = Math.min(offset, file.size);
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? transferred / elapsed : 0;

            this.onProgressChange?.({
                transferred,
                total: file.size,
                percentage: (transferred / file.size) * 100,
                speed
            });

            // Small delay to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Send completion signal
        this.connection.send({ type: 'complete' });
        this.onStatusChange?.('completed');
    }

    // Receiving file data
    private receivedChunks: ArrayBuffer[] = [];
    private fileMetadata: FileMetadata | null = null;
    private receivedChunkCount = 0;
    private receiveStartTime = 0;

    private handleIncomingData(data: any) {
        if (data.type === 'metadata') {
            console.log('Received file metadata:', data.data);
            this.fileMetadata = data.data;
            this.receivedChunks = [];
            this.receivedChunkCount = 0;
            this.receiveStartTime = Date.now();
            this.onStatusChange?.('transferring');
        }
        else if (data.type === 'chunk') {
            this.receivedChunks[data.index] = data.data;
            this.receivedChunkCount++;

            if (this.fileMetadata) {
                const transferred = this.receivedChunkCount * CHUNK_SIZE;
                const elapsed = (Date.now() - this.receiveStartTime) / 1000;
                const speed = elapsed > 0 ? transferred / elapsed : 0;

                this.onProgressChange?.({
                    transferred: Math.min(transferred, this.fileMetadata.size),
                    total: this.fileMetadata.size,
                    percentage: (this.receivedChunkCount / this.fileMetadata.totalChunks) * 100,
                    speed
                });
            }
        }
        else if (data.type === 'complete') {
            console.log('File transfer complete');
            this.assembleFile();
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
        this.onStatusChange?.('completed');

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

    // Clean up connections
    destroy() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
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
