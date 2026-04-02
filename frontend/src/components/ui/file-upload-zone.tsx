"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
    Upload,
    FileText,
    FileArchive,
    Folder,
    File,
    FileCode,
    FileSpreadsheet,
    FileImage,
    CheckSquare,
    Square,
} from "lucide-react"

// ---- Helpers ----

function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B"
    const units = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function getFileExtension(name: string): string {
    return name.split(".").pop()?.toLowerCase() || ""
}

function getFileTypeBadge(name: string): { label: string; color: string } {
    const ext = getFileExtension(name)
    const map: Record<string, { label: string; color: string }> = {
        pdf: { label: "PDF", color: "text-red-400 border-red-500/30 bg-red-500/10" },
        txt: { label: "TXT", color: "text-neutral-400 border-neutral-500/30 bg-neutral-500/10" },
        md: { label: "MD", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
        docx: { label: "DOCX", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
        doc: { label: "DOC", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
        csv: { label: "CSV", color: "text-green-400 border-green-500/30 bg-green-500/10" },
        json: { label: "JSON", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
        xml: { label: "XML", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
        yaml: { label: "YAML", color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
        yml: { label: "YAML", color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
        html: { label: "HTML", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
        htm: { label: "HTML", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
        py: { label: "Python", color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
        js: { label: "JS", color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
        ts: { label: "TS", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
        tsx: { label: "TSX", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
        jsx: { label: "JSX", color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
        zip: { label: "ZIP", color: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
    }
    return map[ext] || { label: ext.toUpperCase() || "FILE", color: "text-neutral-400 border-neutral-500/30 bg-neutral-500/10" }
}

function getFileIcon(name: string) {
    const ext = getFileExtension(name)
    if (ext === "zip") return FileArchive
    if (["py", "js", "ts", "tsx", "jsx", "html", "xml", "yaml", "yml", "json"].includes(ext)) return FileCode
    if (["csv"].includes(ext)) return FileSpreadsheet
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return FileImage
    if (["pdf", "txt", "md", "docx", "doc"].includes(ext)) return FileText
    return File
}

export function isZipFile(file: File): boolean {
    return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed"
}

export function isBinaryFile(file: File): boolean {
    const ext = getFileExtension(file.name)
    const binaryExts = ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "png", "jpg", "jpeg", "gif", "webp", "svg", "zip", "tar", "gz", "rar", "7z", "bz2", "exe", "dll", "so", "dylib", "wasm"]
    return binaryExts.includes(ext)
}

// ---- Types ----

export interface FileEntry {
    file: File
    name: string
    selected: boolean
}

export interface FileUploadZoneProps {
    onFiles: (files: File[]) => void
    accept?: string
    multiple?: boolean
    allowFolder?: boolean
    /** Show a file list with checkboxes for multi-file uploads (ZIP, folder) */
    showFileList?: boolean
    /** Compact mode for smaller panels */
    compact?: boolean
    /** Drop zone help text override */
    helpText?: string
    /** Supported types text override */
    supportedText?: string
    /** External uploading state */
    uploading?: boolean
    /** External uploaded file name */
    uploadedFileName?: string
    /** External upload success indicator */
    uploadSuccess?: boolean
    /** Called when ZIP file entries change (for parent to track) */
    onZipEntries?: (entries: FileEntry[]) => void
    /** Called when folder entries change */
    onFolderEntries?: (entries: FileEntry[]) => void
}

export function FileUploadZone({
    onFiles,
    accept,
    multiple = false,
    allowFolder = false,
    showFileList = true,
    compact = false,
    helpText,
    supportedText,
    uploading = false,
    uploadedFileName,
    uploadSuccess = false,
    onZipEntries,
    onFolderEntries,
}: FileUploadZoneProps) {
    const [dragOver, setDragOver] = useState(false)
    const [entries, setEntries] = useState<FileEntry[]>([])
    const [uploadType, setUploadType] = useState<"single" | "zip" | "folder" | null>(null)
    const [zipFileCount, setZipFileCount] = useState(0)
    const [loadingZip, setLoadingZip] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)

    const handleFiles = useCallback(async (fileList: FileList | File[]) => {
        const files = Array.from(fileList)
        if (files.length === 0) return

        // Multiple files from folder input
        if (files.length > 1) {
            setUploadType("folder")
            const newEntries = files.map((f) => ({ file: f, name: f.webkitRelativePath || f.name, selected: true }))
            setEntries(newEntries)
            onFolderEntries?.(newEntries)
            onFiles(files)
            return
        }

        const file = files[0]

        // ZIP detection
        if (isZipFile(file)) {
            setUploadType("zip")
            setLoadingZip(true)
            try {
                const JSZip = (await import("jszip")).default
                const zip = await JSZip.loadAsync(file)
                const zipEntries: FileEntry[] = []
                const FileConstructor = globalThis.File
                zip.forEach((relativePath, zipEntry) => {
                    if (!zipEntry.dir) {
                        // Create a placeholder File for display (actual extraction done server-side)
                        const placeholder = new FileConstructor([], relativePath, { type: "application/octet-stream" })
                        zipEntries.push({ file: placeholder, name: relativePath, selected: true })
                    }
                })
                setEntries(zipEntries)
                setZipFileCount(zipEntries.length)
                onZipEntries?.(zipEntries)
            } catch {
                // If we can't read the ZIP client-side, still allow upload
                setZipFileCount(-1)
            } finally {
                setLoadingZip(false)
            }
            onFiles([file])
            return
        }

        // Single file
        setUploadType("single")
        setEntries([{ file, name: file.name, selected: true }])
        onFiles([file])
    }, [onFiles, onZipEntries, onFolderEntries])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files)
        }
    }, [handleFiles])

    const toggleEntry = useCallback((index: number) => {
        setEntries((prev) => {
            const next = [...prev]
            next[index] = { ...next[index], selected: !next[index].selected }
            return next
        })
    }, [])

    const toggleAll = useCallback((selected: boolean) => {
        setEntries((prev) => prev.map((e) => ({ ...e, selected })))
    }, [])

    const selectedCount = entries.filter((e) => e.selected).length

    const defaultHelp = allowFolder
        ? "Drop any file, ZIP archive, or folder here"
        : "Drop any file or ZIP archive here"

    const defaultSupported = "PDF, TXT, MD, DOCX, CSV, JSON, XML, YAML, HTML, Python, JavaScript, TypeScript, and more"

    return (
        <div className="space-y-2">
            {/* Drop zone */}
            <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-all cursor-pointer",
                    compact ? "py-5" : "py-8",
                    dragOver
                        ? "border-blue-500/50 bg-blue-500/5 animate-pulse"
                        : "border-white/[0.06] hover:border-white/10 hover:bg-white/[0.02]"
                )}
            >
                <Upload className={cn(compact ? "w-5 h-5" : "w-6 h-6", dragOver ? "text-blue-400" : "text-neutral-600")} />

                {uploading ? (
                    <p className="text-[11px] text-neutral-400">Uploading...</p>
                ) : uploadedFileName ? (
                    <div className="flex flex-col items-center gap-1">
                        <p className="text-[11px] text-neutral-300">{uploadedFileName}</p>
                        {uploadSuccess && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                                Uploaded
                            </span>
                        )}
                    </div>
                ) : (
                    <>
                        <p className="text-[11px] text-neutral-500 text-center px-4">
                            {helpText || defaultHelp}
                        </p>
                        <p className="text-[9px] text-neutral-600 text-center px-4">
                            {supportedText || defaultSupported}
                        </p>
                    </>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept={accept}
                    multiple={multiple}
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files) handleFiles(e.target.files)
                    }}
                />
            </div>

            {/* Folder upload button */}
            {allowFolder && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] text-[10px] text-neutral-400 hover:text-neutral-200 transition-all"
                >
                    <Folder className="w-3.5 h-3.5" />
                    Upload Folder
                    <input
                        ref={folderInputRef}
                        type="file"
                        // @ts-expect-error -- webkitdirectory is a non-standard attribute
                        webkitdirectory=""
                        directory=""
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files) handleFiles(e.target.files)
                        }}
                    />
                </button>
            )}

            {/* Upload type summary */}
            {uploadType === "zip" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                    <FileArchive className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="text-[11px] text-violet-300">
                        {loadingZip
                            ? "Reading ZIP archive..."
                            : zipFileCount === -1
                                ? "ZIP archive detected"
                                : `ZIP archive - ${zipFileCount} file${zipFileCount !== 1 ? "s" : ""} will be extracted`
                        }
                    </span>
                </div>
            )}

            {uploadType === "folder" && entries.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Folder className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-[11px] text-blue-300">
                        Folder - {entries.length} file{entries.length !== 1 ? "s" : ""} selected
                    </span>
                </div>
            )}

            {uploadType === "single" && entries.length === 1 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    {(() => {
                        const Icon = getFileIcon(entries[0].name)
                        return <Icon className="w-4 h-4 text-neutral-400 shrink-0" />
                    })()}
                    <span className="text-[11px] text-neutral-300 truncate flex-1">{entries[0].name}</span>
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border", getFileTypeBadge(entries[0].name).color)}>
                        {getFileTypeBadge(entries[0].name).label}
                    </span>
                    <span className="text-[9px] text-neutral-500">{formatFileSize(entries[0].file.size)}</span>
                </div>
            )}

            {/* File list with checkboxes for ZIP / folder */}
            {showFileList && (uploadType === "zip" || uploadType === "folder") && entries.length > 0 && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    {/* Select all header */}
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.02]">
                        <button onClick={() => toggleAll(selectedCount < entries.length)} className="text-neutral-400 hover:text-white transition-colors">
                            {selectedCount === entries.length
                                ? <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                                : <Square className="w-3.5 h-3.5" />
                            }
                        </button>
                        <span className="text-[9px] text-neutral-500">
                            {selectedCount}/{entries.length} selected
                        </span>
                    </div>
                    {/* File list (max 10 visible, scrollable) */}
                    <div className="max-h-40 overflow-y-auto">
                        {entries.map((entry, i) => {
                            const Icon = getFileIcon(entry.name)
                            const badge = getFileTypeBadge(entry.name)
                            return (
                                <button
                                    key={i}
                                    onClick={() => toggleEntry(i)}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.03] transition-colors",
                                        !entry.selected && "opacity-40"
                                    )}
                                >
                                    {entry.selected
                                        ? <CheckSquare className="w-3 h-3 text-blue-400 shrink-0" />
                                        : <Square className="w-3 h-3 text-neutral-600 shrink-0" />
                                    }
                                    <Icon className="w-3 h-3 text-neutral-500 shrink-0" />
                                    <span className="text-[10px] text-neutral-300 truncate flex-1">{entry.name}</span>
                                    <span className={cn("text-[8px] px-1 py-0.5 rounded border", badge.color)}>
                                        {badge.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
