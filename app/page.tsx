'use client';

import { useState, useRef, useEffect } from 'react';
import { P2PFileTransfer, ConnectionStatus, TransferProgress, ClientInfo, formatBytes, formatSpeed } from '@/lib/p2p';
import QRCode from 'qrcode';
import { Upload, Share2, CheckCircle, XCircle, Loader2, X, Copy, Check, Users } from 'lucide-react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [clientProgress, setClientProgress] = useState<Map<string, TransferProgress>>(new Map());
  const [connectedClients, setConnectedClients] = useState<ClientInfo[]>([]);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const p2pRef = useRef<P2PFileTransfer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (p2pRef.current) {
        p2pRef.current.destroy();
      }
    };
  }, []);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    setStatus('idle');
    setProgress(null);
    setClientProgress(new Map());
    setConnectedClients([]);
    initializeSender(selectedFile);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const initializeSender = async (selectedFile: File) => {
    try {
      p2pRef.current = new P2PFileTransfer();

      const id = await p2pRef.current.initSender(
        (newStatus) => {
          setStatus(newStatus);
          if (newStatus === 'connected') {
            // Update connected clients list
            updateConnectedClients();
          }
        },
        (errorMsg) => {
          setError(errorMsg);
          showToast(errorMsg, 'error');
        },
        (clientId) => {
          // New client connected
          console.log('Client connected:', clientId);
          updateConnectedClients();
          
          // Automatically start transfer if we have a file
          if (selectedFile) {
            setTimeout(() => {
              sendFileToClients(selectedFile);
            }, 500); // Small delay to ensure connection is fully established
          }
        },
        (clientId) => {
          // Client disconnected
          console.log('Client disconnected:', clientId);
          updateConnectedClients();
        }
      );

      setRoomId(id);

      // Generate QR code
      const shareUrl = `${window.location.origin}/receive/${id}`;
      const qrUrl = await QRCode.toDataURL(shareUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeUrl(qrUrl);

    } catch (err: any) {
      setError('Failed to initialize: ' + err.message);
      setStatus('error');
      showToast('Failed to initialize connection', 'error');
    }
  };

  const updateConnectedClients = () => {
    if (p2pRef.current) {
      const clients = p2pRef.current.getConnectedClients();
      setConnectedClients(clients);
      
      // Update progress map
      const newProgressMap = new Map<string, TransferProgress>();
      clients.forEach(client => {
        newProgressMap.set(client.id, client.progress);
      });
      setClientProgress(newProgressMap);
    }
  };

  const sendFileToClients = async (fileToSend: File) => {
    if (!p2pRef.current || !fileToSend) return;
    
    try {
      // Set up progress handler
      p2pRef.current['onProgressChange'] = (clientId, progress) => {
        setClientProgress(prev => {
          const newMap = new Map(prev);
          newMap.set(clientId, progress);
          return newMap;
        });
        
        // Update overall progress (average of all clients)
        const allProgress = Array.from(clientProgress.values());
        if (allProgress.length > 0) {
          const totalPercentage = allProgress.reduce((sum, p) => sum + p.percentage, 0);
          const avgPercentage = totalPercentage / allProgress.length;
          
          setProgress({
            transferred: Math.max(...allProgress.map(p => p.transferred)),
            total: allProgress[0]?.total || 0,
            percentage: avgPercentage,
            speed: allProgress.reduce((sum, p) => sum + p.speed, 0)
          });
        }
      };
      
      await p2pRef.current.sendFile(fileToSend);
    } catch (err: any) {
      setError('Failed to send file: ' + err.message);
      showToast('Failed to send file', 'error');
    }
  };

  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}/receive/${roomId}`;

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        showToast('Link copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback for non-HTTPS or older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          showToast('Link copied to clipboard!');
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          showToast('Failed to copy link', 'error');
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      showToast('Failed to copy link', 'error');
    }
  };

  const resetTransfer = () => {
    setFile(null);
    setRoomId('');
    setQrCodeUrl('');
    setStatus('idle');
    setProgress(null);
    setClientProgress(new Map());
    setConnectedClients([]);
    setError('');
    if (p2pRef.current) {
      p2pRef.current.destroy();
      p2pRef.current = null;
    }
  };

  const renderStatus = () => {
    switch (status) {
      case 'idle':
        return (
          <div className="flex items-center gap-2 text-blue-400">
            <div className="w-2 h-2 bg-blue-400 rounded-full pulse"></div>
            <span>Waiting for receivers... ({connectedClients.length} connected)</span>
          </div>
        );
      case 'connecting':
        return (
          <div className="flex items-center gap-2 text-yellow-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting...</span>
          </div>
        );
      case 'connected':
        return (
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span>
              {connectedClients.length > 0 
                ? `${connectedClients.length} client${connectedClients.length > 1 ? 's' : ''} connected` 
                : 'Connected! Waiting for receivers...'}
            </span>
          </div>
        );
      case 'transferring':
        return (
          <div className="flex items-center gap-2 text-purple-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Sending file to {connectedClients.length} client{connectedClients.length > 1 ? 's' : ''}...</span>
          </div>
        );
      case 'completed':
        return (
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span>Transfer completed to all clients!</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-4 h-4" />
            <span>Error occurred</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen animated-bg flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8 animate-fadeIn">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            P2P File Transfer
          </h1>
          <p className="text-gray-400 text-lg">
            Secure, direct file sharing through your browser
          </p>
        </div>

        {/* Main Card */}
        <div className="card space-y-6">
          {!file ? (
            /* Upload Area */
            <div
              className={`upload-area cursor-pointer ${isDragging ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <div className="flex flex-col items-center gap-4 text-center">
                <Upload className="w-16 h-16 text-purple-400" />
                <div>
                  <p className="text-xl font-semibold mb-2">
                    Drop your file here or click to browse
                  </p>
                  <p className="text-gray-400">
                    Your file stays on your device and transfers directly to the receivers
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* File Selected - Show Share Options */
            <div className="space-y-6">
              {/* File Info */}
              <div className="glass rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-lg">{file.name}</p>
                    <p className="text-gray-400">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setRoomId('');
                      setQrCodeUrl('');
                      setStatus('idle');
                      setProgress(null);
                      setClientProgress(new Map());
                      setConnectedClients([]);
                      p2pRef.current?.destroy();
                    }}
                    className="btn-secondary px-4 py-2"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Status */}
              <div className="glass rounded-xl p-4">
                {renderStatus()}
              </div>

              {/* Connected Clients */}
              {connectedClients.length > 0 && (
                <div className="glass rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold">Connected Receivers ({connectedClients.length})</h3>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {connectedClients.map(client => (
                      <div key={client.id} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-gray-300 truncate mr-2">#{client.id.substring(0, 8)}</span>
                        {clientProgress.has(client.id) && (
                          <span className="text-gray-400 whitespace-nowrap">
                            {clientProgress.get(client.id)?.percentage.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress */}
              {progress && (
                <div className="glass rounded-xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Overall Progress</span>
                    <span className="font-semibold">{progress.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar">
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
              )}

              {/* Share Options */}
              {roomId && qrCodeUrl && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-xl font-semibold mb-4">Share this QR code or link</h3>
                    <div className="flex justify-center mb-4">
                      <div className="qr-container">
                        <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-xl p-4">
                    <label className="block text-sm text-gray-400 mb-2">Share Link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={`${window.location.origin}/receive/${roomId}`}
                        readOnly
                        className="flex-1 bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-sm"
                      />
                      <button
                        onClick={copyShareLink}
                        className="btn-primary flex items-center gap-2"
                      >
                        <Share2 className="w-4 h-4" />
                        Copy
                      </button>
                    </div>
                  </div>

                  {/* Auto-transfer notification */}
                  {connectedClients.length > 0 && status !== 'transferring' && status !== 'completed' && (
                    <div className="glass rounded-xl p-4 bg-blue-500/10 border border-blue-500/50">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                        <span className="text-blue-400">File transfer will start automatically when clients connect</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 text-red-400">
                  {error}
                </div>
              )}

              {/* Completed Message */}
              {status === 'completed' && (
                <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-4 text-center">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <h3 className="text-lg font-semibold">Transfer Complete!</h3>
                  <p className="text-gray-400 text-sm">
                    Your file has been successfully sent to all connected clients. 
                    QR code is still active for more transfers.
                  </p>
                </div>
              )}
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