'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { P2PFileTransfer, ConnectionStatus, TransferProgress, formatBytes, formatSpeed } from '@/lib/p2p';
import { Download, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function ReceivePage() {
    const params = useParams();
    const roomId = params.roomId as string;

    const [status, setStatus] = useState<ConnectionStatus>('idle');
    const [progress, setProgress] = useState<TransferProgress | null>(null);
    const [receivedFile, setReceivedFile] = useState<File | null>(null);
    const [error, setError] = useState<string>('');

    const p2pRef = useRef<P2PFileTransfer | null>(null);
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (!roomId || hasInitialized.current) return;

        hasInitialized.current = true;
        initializeReceiver();

        return () => {
            if (p2pRef.current) {
                p2pRef.current.destroy();
            }
        };
    }, [roomId]);

    const initializeReceiver = async () => {
        try {
            p2pRef.current = new P2PFileTransfer();

            await p2pRef.current.initReceiver(
                roomId,
                (newStatus) => setStatus(newStatus),
                (newProgress) => setProgress(newProgress),
                (file) => {
                    setReceivedFile(file);
                    setStatus('completed');
                },
                (errorMsg) => {
                    setError(errorMsg);
                    setStatus('error');
                }
            );
        } catch (err: any) {
            setError('Failed to connect: ' + err.message);
            setStatus('error');
        }
    };

    const downloadFile = () => {
        if (!receivedFile) return;

        const url = URL.createObjectURL(receivedFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = receivedFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const renderContent = () => {
        if (status === 'error') {
            return (
                <div className="text-center space-y-4">
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
            );
        }

        if (status === 'completed' && receivedFile) {
            return (
                <div className="text-center space-y-6">
                    <CheckCircle className="w-20 h-20 text-green-400 mx-auto" />
                    <div>
                        <h2 className="text-3xl font-bold mb-2">File Received!</h2>
                        <p className="text-gray-400">Your file is ready to download</p>
                    </div>

                    <div className="glass rounded-xl p-6 space-y-4">
                        <div className="text-left">
                            <p className="text-sm text-gray-400 mb-1">File Name</p>
                            <p className="text-lg font-semibold">{receivedFile.name}</p>
                        </div>
                        <div className="text-left">
                            <p className="text-sm text-gray-400 mb-1">File Size</p>
                            <p className="text-lg font-semibold">{formatBytes(receivedFile.size)}</p>
                        </div>
                    </div>

                    <button
                        onClick={downloadFile}
                        className="btn-primary flex items-center gap-2 mx-auto text-lg px-8 py-4"
                    >
                        <Download className="w-5 h-5" />
                        Download File
                    </button>

                    <p className="text-sm text-gray-500">
                        The file is ready in your browser memory. Click download to save it to your device.
                    </p>
                </div>
            );
        }

        if (status === 'transferring' && progress) {
            return (
                <div className="space-y-6">
                    <div className="text-center">
                        <Loader2 className="w-20 h-20 text-purple-400 mx-auto mb-4 animate-spin" />
                        <h2 className="text-3xl font-bold mb-2">Receiving File...</h2>
                        <p className="text-gray-400">Transfer in progress</p>
                    </div>

                    <div className="glass rounded-xl p-6 space-y-4">
                        <div className="flex justify-between text-lg">
                            <span>Progress</span>
                            <span className="font-bold text-purple-400">{progress.percentage.toFixed(1)}%</span>
                        </div>
                        <div className="progress-bar h-4">
                            <div
                                className="progress-fill"
                                style={{ width: `${progress.percentage}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>{formatBytes(progress.transferred)} / {formatBytes(progress.total)}</span>
                            <span>{formatSpeed(progress.speed)}</span>
                        </div>
                    </div>
                </div>
            );
        }

        if (status === 'connected') {
            return (
                <div className="text-center space-y-4">
                    <CheckCircle className="w-20 h-20 text-green-400 mx-auto" />
                    <h2 className="text-3xl font-bold">Connected!</h2>
                    <p className="text-gray-400">Waiting for file transfer to begin...</p>
                    <div className="pulse w-3 h-3 bg-green-400 rounded-full mx-auto"></div>
                </div>
            );
        }

        // Default: connecting state
        return (
            <div className="text-center space-y-6">
                <Loader2 className="w-20 h-20 text-blue-400 mx-auto animate-spin" />
                <div>
                    <h2 className="text-3xl font-bold mb-2">Establishing Connection...</h2>
                    <p className="text-gray-400">Connecting to sender via secure P2P</p>
                </div>

                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        <p className="text-sm text-gray-400 text-left">
                            Make sure the sender has their page open and the file is ready to transfer.
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen animated-bg flex items-center justify-center p-4">
            <div className="max-w-2xl w-full">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                        P2P File Transfer
                    </h1>
                    <p className="text-gray-400">
                        Room: <span className="font-mono text-purple-400">{roomId}</span>
                    </p>
                </div>

                {/* Main Card */}
                <div className="card min-h-[400px] flex items-center justify-center">
                    {renderContent()}
                </div>

                {/* Info Footer */}
                <div className="mt-8 text-center text-gray-500 text-sm space-y-2">
                    <p>🔒 End-to-end encrypted • No server storage • Direct P2P transfer</p>
                    {status === 'idle' || status === 'connecting' ? (
                        <p className="text-xs">This may take a few seconds to establish the connection...</p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
