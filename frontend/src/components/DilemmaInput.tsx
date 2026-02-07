import { useState, useRef } from "react";
import { Scale, ArrowRight, Sparkles, Paperclip, X, Loader2, FileText } from "lucide-react";

const EXAMPLE_CHIPS = [
  "Should CMU require AI ethics courses?",
  "Should I take a remote job offer over in-office?",
  "Should our company adopt open-source AI models?",
  "Is universal basic income viable for the US?",
];

interface UploadedFile {
  original_name: string;
  file_path: string;
}

interface DilemmaInputProps {
  onSubmit: (dilemma: string, filePaths: string[]) => void;
  isDemo?: boolean;
}

export function DilemmaInput({
  onSubmit,
  isDemo,
}: DilemmaInputProps) {
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<UploadedFile | null>(null);
  
  // NEW: Local state to track if we are waiting for the debate to start
  const [isStarting, setIsStarting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    
    // Lock the interface immediately
    setIsStarting(true);

    // Pass single file as an array of 1
    const filePaths = attachedFile ? [attachedFile.file_path] : [];
    
    // Fire the event. The parent (App.tsx) will unmount this component
    // once the WebSocket phase changes, so we don't need to unset isStarting.
    onSubmit(trimmed, filePaths);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const response = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      
      setAttachedFile({ 
        original_name: data.original_name, 
        file_path: data.file_path 
      });
      
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Failed to upload file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = () => {
    setAttachedFile(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        {/* Logo / Title */}
        <div className="mb-12 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <Scale className="h-10 w-10 text-gold" />
            <h1 className="text-5xl font-bold tracking-tight text-court-text">
              Courtroom
            </h1>
          </div>
          <p className="text-lg text-court-text-dim">
            Adversarial epistemology — AI agents competing on
            evidence quality, not rhetoric.
          </p>
          {isDemo && (
            <p className="mt-3 text-sm text-evidence">
              Demo mode — runs with mock data (no backend needed)
            </p>
          )}
        </div>

        {/* Input Area */}
        <div className="rounded-2xl border border-court-border bg-court-surface p-6">
          <label className="mb-3 block text-sm font-medium text-court-text-dim">
            I need to decide whether to...
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStarting} // Disable input while starting
            placeholder="e.g., require AI ethics courses in the CS curriculum"
            className="w-full resize-none rounded-xl border border-court-border bg-court-panel px-4 py-3 text-lg text-court-text placeholder-court-text-muted outline-none transition-colors focus:border-gold disabled:opacity-50"
            rows={3}
          />
          
          {/* File Attachment Chip */}
          {attachedFile && (
            <div className="mt-3 flex w-fit items-center gap-2 rounded-md bg-court-panel border border-court-border px-3 py-1.5 text-xs text-court-text">
              <FileText className="h-3 w-3 text-gold" />
              <span className="max-w-[200px] truncate">{attachedFile.original_name}</span>
              <button 
                onClick={removeFile}
                disabled={isStarting}
                className="ml-1 text-court-text-muted hover:text-red-400 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileSelect}
                disabled={isUploading || isStarting} 
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isStarting}
                className="flex items-center gap-2 text-xs text-court-text-muted hover:text-gold transition-colors disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
                {isUploading 
                  ? "Uploading..." 
                  : attachedFile 
                    ? "Replace document" 
                    : "Attach document"
                }
              </button>
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isUploading || isStarting}
              className="flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-semibold text-court-bg transition-all hover:shadow-lg hover:shadow-gold/20 disabled:cursor-not-allowed disabled:opacity-40 min-w-[140px] justify-center"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening...
                </>
              ) : (
                <>
                  Open Court
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Example Chips */}
        <div className="mt-6">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-court-text-muted">
            Try an example
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setInput(chip)}
                disabled={isStarting}
                className="rounded-full border border-court-border bg-court-panel px-4 py-2 text-sm text-court-text-dim transition-colors hover:border-gold/50 hover:text-court-text disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}