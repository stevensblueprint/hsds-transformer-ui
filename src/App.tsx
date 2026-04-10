import { useState, useEffect, type DragEvent, type ChangeEvent } from "react";
import "./App.css";

// API URL configuration
// In development: defaults to localhost:8000
// In production: set VITE_API_URL environment variable to your AWS endpoint
// If not set, falls back to /api (same-origin proxy)
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:8000" : "/api");

const LOG_HEADER_CANDIDATES = [
  "x-transformer-logs",
  "x-transform-logs",
  "x-log-output",
  "x-logs",
];

const normalizeOutput = (value: unknown): string | null => {
  if (value == null) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const rows = value.map((item) => normalizeOutput(item)).filter(Boolean);
    return rows.length > 0 ? rows.join("\n") : null;
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
};

const decodeHeaderValue = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractLogOutput = (response: Response): string | null => {
  for (const headerName of LOG_HEADER_CANDIDATES) {
    const raw = response.headers.get(headerName);
    if (!raw) continue;

    const decoded = decodeHeaderValue(raw);
    const normalized = normalizeOutput(decoded);
    if (normalized) return normalized;
  }

  return null;
};

const parseErrorDetail = (responseBody: string): string | null => {
  if (!responseBody) return null;

  try {
    const parsed = JSON.parse(responseBody) as Record<string, unknown>;

    const detail =
      parsed.detail ??
      parsed.error ??
      parsed.message ??
      parsed.errors ??
      parsed.logs;

    return normalizeOutput(detail ?? parsed);
  } catch {
    return normalizeOutput(responseBody);
  }
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logOutput, setLogOutput] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  // Cleanup download URL on unmount
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  // Check API health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_URL}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        setIsOnline(response.ok);
      } catch {
        setIsOnline(false);
      }
    };
    checkHealth();
  }, []);

  const clearDownloadUrl = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      if (droppedFile.name.toLowerCase().endsWith(".zip")) {
        setFile(droppedFile);
        setError(null);
        setLogOutput(null);
        clearDownloadUrl();
      } else {
        setError("Please drop a .zip file");
      }
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.toLowerCase().endsWith(".zip")) {
        setFile(selectedFile);
        setError(null);
        setLogOutput(null);
        clearDownloadUrl();
      } else {
        setError("Please select a .zip file");
      }
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setLogOutput(null);
    clearDownloadUrl();

    try {
      const formData = new FormData();
      formData.append("zip_file", file);

      const response = await fetch(`${API_URL}/transform`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const responseBody = await response.text();
        const errorDetail = parseErrorDetail(responseBody);

        const statusMessage = `Transform failed (${response.status} ${response.statusText})`;
        const message = errorDetail
          ? `${statusMessage}: ${errorDetail}`
          : statusMessage;
        throw new Error(message);
      }

      const logs = extractLogOutput(response);
      if (logs) {
        setLogOutput(logs);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!downloadUrl || !file) return;

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `transformed_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFile(null);
    clearDownloadUrl();
    setLogOutput(null);
    setError(null);
  };

  const handleFileInputClick = () => {
    document.getElementById("fileInput")?.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="text-4xl font-bold text-gray-900">
              HSDS Transformer
            </h1>
            {isOnline !== null && (
              <span
                className={`px-2 py-1 text-xs rounded-full ${
                  isOnline
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {isOnline ? "Connected" : "Disconnected"}
              </span>
            )}
          </div>
          <p className="text-lg text-gray-600">
            Transform your CSV data into HSDS JSON format. Drop a zip file
            containing your input CSVs and mapping files to get started.
          </p>
        </div>

        {/* File Drop Zone */}
        <div
          className={`bg-white rounded-lg shadow-sm border-2 border-dashed p-8 text-center transition-colors ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
          role="button"
          tabIndex={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleFileInputClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
              e.preventDefault();
              handleFileInputClick();
            }
          }}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-gray-700 font-medium">{file.name}</span>
              <button
                className="text-gray-400 hover:text-gray-600 ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReset();
                }}
                aria-label="Remove file"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <svg
                className="w-12 h-12 text-gray-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-gray-600 mb-2">
                Drag and drop a .zip file here
              </p>
              <p className="text-gray-400 text-sm">or click to browse</p>
              <input
                type="file"
                id="fileInput"
                accept=".zip"
                className="hidden"
                onChange={handleFileSelect}
              />
            </>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm whitespace-pre-wrap break-words font-mono">
              {error}
            </p>
          </div>
        )}

        {/* Download Button (Success) */}
        {downloadUrl && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm mb-3">
              Transformation complete!
            </p>
            <button
              onClick={handleDownload}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download Transformed Files
            </button>

            <div className="mt-4 p-3 bg-white border border-green-100 rounded-md">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                Transformer log output
              </p>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap break-words font-mono">
                {logOutput || "No log output returned by the API."}
              </pre>
            </div>
          </div>
        )}

        {/* Submit Button */}
        {file && !downloadUrl && (
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg
                  className="w-5 h-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Transforming...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Transform
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
