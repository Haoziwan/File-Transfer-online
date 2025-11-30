'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { P2PFileTransfer, ConnectionStatus, TransferProgress, formatBytes, formatSpeed } from '@/lib/p2p';
import { Upload, Download, Loader2, CheckCircle, XCircle, AlertCircle, ArrowLeftRight, Users } from 'lucide-react';

interface FileTransferState {
    file: File | null;
    progress: TransferProgress | null;
    status: 'idle' | 'sending' | 'completed';
}

export default function ConnectWithPeerPage() {
    const params = useParams();
    const roomId = params.roomId as string;

    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [error, setError] = useState<string>('');
    const [isConnected, setIsConnected] = useState(false);

    // Outgoing file (file to send)
    const [outgoingFile, setOutgoingFile] = useState<FileTransferState>({
        file: null,
        progress: null,
        status: 'idle'
    });

    // Incoming file (file being received)
    const [incomingFile, setIncomingFile] = useState<File | null>(null);
    const [incomingProgress, setIncomingProgress] = useState<TransferProgress | null>(null);
    const [incomingStatus, setIncomingStatus] = useState<'idle' | 'receiving' | 'completed'>('idle');

    const p2pRef = useRef<P2PFileTransfer | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (!roomId || hasInitialized.current) return;

        hasInitialized.current = true;
        initializeConnection();

        return () => {
            if (p2pRef.current) {
                p2pRef.current.destroy();
            }
        };
    }, [roomId]);

    const initializeConnection = async () => {
        try {
            setConnectionStatus('connecting');
            p2pRef.current = new P2PFileTransfer();

            await p2pRef.current.initReceiver(
                roomId,
                (status) => {
                    setConnectionStatus(status);
                    if (status === 'connected') {
                        setIsConnected(true);
                    } else if (status === 'error') {
                        setIsConnected(false);
                    }
                },
                (progress) => {
                    setIncomingProgress(progress);
                    setIncomingStatus('receiving');
                },
                (file) => {
                    setIncomingFile(file);
                    setIncomingStatus('completed');
                },
                (errorMsg) => {
                    setError(errorMsg);
                    setConnectionStatus('error');
                    setIsConnected(false);
                }
            );
        } catch (err: any) {
            setError('Failed to connect: ' + err.message);
            setConnectionStatus('error');
            setIsConnected(false);
        }
    };

    const handleFileSelect = (selectedFile: File) => {
        setOutgoingFile({
            file: selectedFile,
            progress: null,
            status: 'idle'
        });
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            handleFileSelect(selectedFile);
        }
    };

    const sendFile = async () => {
        if (!p2pRef.current || !outgoingFile.file) return;

        try {
            setOutgoingFile(prev => ({ ...prev, status: 'sending' }));

            // Set up progress handler
            p2pRef.current['onProgressChange'] = (clientId: string, progress: TransferProgress) => {
                setOutgoingFile(prev => ({
                    ...prev,
                    progress,
                    status: 'sending'
                }));
            };

            await p2pRef.current.sendFile(outgoingFile.file);
            setOutgoingFile(prev => ({ ...prev, status: 'completed' }));
        } catch (err: any) {
            setError('Failed to send file: ' + err.message);
            setOutgoingFile(prev => ({ ...prev, status: 'idle' }));
        }
    };

    const downloadIncomingFile = () => {
        if (!incomingFile) return;

        const url = URL.createObjectURL(incomingFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = incomingFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const renderConnectionStatus = () => {
        return (
            <div className="glass rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-400" />
                        <span className="font-semibold">Connection Status</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isConnected ? (
                            <>
                                <div className="w-2 h-2 bg-green-400 rounded-full pulse"></div>
                                <span className="text-green-400">Connected</span>
                            </>
                        ) : connectionStatus === 'connecting' ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                                <span className="text-yellow-400">Connecting...</span>
                            </>
                        ) : connectionStatus === 'error' ? (
                            <>
                                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                                <span className="text-red-400">Connection Failed</span>
                            </>
                        ) : (
                            <>
                                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                <span className="text-gray-400">Idle</span>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (connectionStatus === 'error' && !isConnected) {
        return (
            <div className="min-h-screen animated-bg flex items-center justify-center p-4">
                <div className="max-w-md w-full">
                    <div className="card text-center space-y-4">
                        <XCircle className="w-20 h-20 text-red-400 mx-auto" />
                        <h2 className="text-2xl font-semibold">Connection Failed</h2>
                        <p className="text-gray-400">{error || 'Unable to establish connection'}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="btn-primary mt-4"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!isConnected && connectionStatus === 'connecting') {
        return (
            <div className="min-h-screen animated-bg flex items-center justify-center p-4">
                <div className="max-w-md w-full">
                    <div className="card text-center space-y-6">
                        <Loader2 className="w-20 h-20 text-blue-400 mx-auto animate-spin" />
                        <div>
                            <h2 className="text-3xl font-bold mb-2">Establishing Connection...</h2>
                            <p className="text-gray-400">Connecting to peer via secure P2P</p>
                        </div>
                        <div className="glass rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
                                <p className="text-sm text-gray-400 text-left">
                                    Make sure the other peer has their page open and is ready to connect.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen animated-bg flex items-center justify-center p-4">
            <div className="max-w-5xl w-full">
                {/* Header */}
                <div className="text-center mb-8 animate-fadeIn">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <ArrowLeftRight className="w-12 h-12 text-purple-400" />
                        <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                            Bidirectional P2P Transfer
                        </h1>
                    </div>
                    <p className="text-gray-400 text-lg">
                        Connected to room: <span className="font-mono text-purple-400">{roomId}</span>
                    </p>
                </div>

                {/* Main Content */}
                <div className="space-y-6">
                    {/* Connection Info */}
                    {renderConnectionStatus()}

                    {/* Two-column layout for send/receive */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Send File Section */}
                        <div className="card space-y-4">
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                <Upload className="w-5 h-5 text-green-400" />
                                Send File
                            </h3>

                            {!outgoingFile.file ? (
                                <div
                                    className="upload-area cursor-pointer"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        onChange={handleFileInputChange}
                                    />
                                    <div className="flex flex-col items-center gap-3 text-center">
                                        <Upload className="w-12 h-12 text-purple-400" />
                                        <div>
                                            <p className="font-semibold mb-1">Choose file to send</p>
                                            <p className="text-sm text-gray-400">Click to browse</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* File Info */}
                                    <div className="glass rounded-lg p-3">
                                        <p className="font-semibold truncate">{outgoingFile.file.name}</p>
                                        <p className="text-sm text-gray-400">{formatBytes(outgoingFile.file.size)}</p>
                                    </div>

                                    {/* Progress */}
                                    {outgoingFile.progress && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span>Progress</span>
                                                <span className="font-semibold">{outgoingFile.progress.percentage.toFixed(1)}%</span>
                                            </div>
                                            <div className="progress-bar">
                                                <div
                                                    className="progress-fill"
                                                    style={{ width: `${outgoingFile.progress.percentage}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-xs text-gray-400">
                                                <span>{formatBytes(outgoingFile.progress.transferred)} / {formatBytes(outgoingFile.progress.total)}</span>
                                                <span>{formatSpeed(outgoingFile.progress.speed)}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex gap-2">
                                        {outgoingFile.status === 'idle' && (
                                            <button
                                                onClick={sendFile}
                                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                                                disabled={!isConnected}
                                            >
                                                <Upload className="w-4 h-4" />
                                                Send File
                                            </button>
                                        )}
                                        {outgoingFile.status === 'sending' && (
                                            <div className="flex-1 flex items-center justify-center gap-2 text-purple-400">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Sending...
                                            </div>
                                        )}
                                        {outgoingFile.status === 'completed' && (
                                            <div className="flex-1 flex items-center justify-center gap-2 text-green-400">
                                                <CheckCircle className="w-4 h-4" />
                                                Sent Successfully!
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setOutgoingFile({ file: null, progress: null, status: 'idle' })}
                                            className="btn-secondary px-4"
                                        >
                                            Change
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Receive File Section */}
                        <div className="card space-y-4">
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                <Download className="w-5 h-5 text-blue-400" />
                                Receive File
                            </h3>

                            {incomingStatus === 'idle' && (
                                <div className="glass rounded-lg p-8 text-center">
                                    <Download className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                                    <p className="text-gray-400">Waiting for incoming files...</p>
                                </div>
                            )}

                            {incomingStatus === 'receiving' && incomingProgress && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-blue-400">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span className="font-semibold">Receiving file...</span>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span>Progress</span>
                                            <span className="font-semibold">{incomingProgress.percentage.toFixed(1)}%</span>
                                        </div>
                                        <div className="progress-bar">
                                            <div
                                                className="progress-fill"
                                                style={{ width: `${incomingProgress.percentage}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>{formatBytes(incomingProgress.transferred)} / {formatBytes(incomingProgress.total)}</span>
                                            <span>{formatSpeed(incomingProgress.speed)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {incomingStatus === 'completed' && incomingFile && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-green-400 mb-3">
                                        <CheckCircle className="w-5 h-5" />
                                        <span className="font-semibold">File received!</span>
                                    </div>

                                    <div className="glass rounded-lg p-3">
                                        <p className="font-semibold truncate">{incomingFile.name}</p>
                                        <p className="text-sm text-gray-400">{formatBytes(incomingFile.size)}</p>
                                    </div>

                                    <button
                                        onClick={downloadIncomingFile}
                                        className="btn-primary w-full flex items-center justify-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download File
                                    </button>

                                    <button
                                        onClick={() => {
                                            setIncomingFile(null);
                                            setIncomingProgress(null);
                                            setIncomingStatus('idle');
                                        }}
                                        className="btn-secondary w-full"
                                    >
                                        Clear
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Error Display */}
                    {error && isConnected && (
                        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 text-red-400 flex items-center gap-2">
                            <XCircle className="w-5 h-5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {/* Info Footer */}
                <div className="mt-8 text-center text-gray-500 text-sm">
                    <p>🔒 End-to-end encrypted • No server storage • Direct P2P transfer</p>
                </div>
            </div>
        </div>
    );
}
