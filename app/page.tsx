'use client';

import { useState, useRef, useEffect } from 'react';
import { P2PFileTransfer, ConnectionStatus, TransferProgress, formatBytes, formatSpeed } from '@/lib/p2p';
import QRCode from 'qrcode';
import { Upload, Share2, CheckCircle, XCircle, Loader2, X, Copy, Check } from 'lucide-react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [progress, setProgress] = useState<TransferProgress | null>(null);
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
            // Automatically send file when receiver connects
            setTimeout(() => {
              p2pRef.current?.sendFile(selectedFile).catch(err => {
                setError('Failed to send file: ' + err.message);
                showToast('Failed to send file', 'error');
              });
            }, 500);
          }
        },
        (errorMsg) => {
          setError(errorMsg);
          showToast(errorMsg, 'error');
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

      // Set progress callback after initialization
      p2pRef.current['onProgressChange'] = setProgress;

    } catch (err: any) {
      setError('Failed to initialize: ' + err.message);
      setStatus('error');
      showToast('Failed to initialize connection', 'error');
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
            <span>Waiting for receiver...</span>
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
            <span>Connected! Preparing to send...</span>
          </div>
        );
      case 'transferring':
        return (
          <div className="flex items-center gap-2 text-purple-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Transferring file...</span>
          </div>
        );
      case 'completed':
        return (
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span>Transfer completed!</span>
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
                    Your file stays on your device and transfers directly to the receiver
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

              {/* Progress */}
              {progress && (
                <div className="glass rounded-xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
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
              {roomId && qrCodeUrl && status !== 'completed' && (
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
                <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-6 text-center">
                  <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                  <h3 className="text-2xl font-semibold mb-2">Transfer Complete!</h3>
                  <p className="text-gray-400 mb-4">Your file has been successfully sent</p>
                  <button
                    onClick={() => {
                      setFile(null);
                      setRoomId('');
                      setQrCodeUrl('');
                      setStatus('idle');
                      setProgress(null);
                      p2pRef.current?.destroy();
                    }}
                    className="btn-primary"
                  >
                    Send Another File
                  </button>
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
