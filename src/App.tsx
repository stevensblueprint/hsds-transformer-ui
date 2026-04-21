import { useState, useEffect, type DragEvent, type ChangeEvent } from "react";
import "./App.css";

// API URL configuration
// In development: defaults to localhost:8000
// In production: set VITE_API_URL environment variable to your AWS endpoint
// If not set, falls back to /api (same-origin proxy)
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:8000" : "/api");

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        let errorDetail = responseBody;

        try {
          const err = JSON.parse(responseBody) as { detail?: unknown };
          if (err.detail) {
            errorDetail =
              typeof err.detail === "string"
                ? err.detail
                : JSON.stringify(err.detail);
          } else {
            errorDetail = JSON.stringify(err);
          }
        } catch {
          // Ignore parse errors, use raw response body
        }

        const statusMessage = `Transform failed (${response.status} ${response.statusText})`;
        const message = errorDetail
          ? `${statusMessage}: ${errorDetail}`
          : statusMessage;
        throw new Error(message);
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
            Transform your CSV data into HSDS JSON format. 
          </p>
          <ol className="p-4 text-left text-md text-gray-600 list-decimal list-inside space-y-2">
            <li>Export input files as CSVs</li>
            <li>Create mapping files for the input files using the{" "}
              <a 
                href="https://docs.google.com/spreadsheets/d/1pE8kLsQlLfoGgRzWLNGZdPUmspjFaLSp2S65b-ds2E4/edit?usp=sharing" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 underline hover:text-blue-800"
              > 
              mapping template
              </a> 
              {" "}as per the <a 
                href="https://docs.google.com/document/d/1TEvuGkecCbyyGD8xI6ROholbTnlC-m260hQNx-BqP2w/edit?tab=t.rohtmfo1978" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 underline hover:text-blue-800"
              >
              mapping documentation
              </a>
              </li>
            <li>Create a zip file containing the input CSVs and mapping files and drag and drop below</li>
          </ol>
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
            <p className="text-red-600 text-sm">{error}</p>
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
