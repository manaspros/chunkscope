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
        pdf: { label: "PDF", color: "text-red-600 border-red-200 bg-red-50" },
        txt: { label: "TXT", color: "text-neutral-600 border-neutral-200 bg-neutral-50" },
        md: { label: "MD", color: "text-blue-600 border-blue-200 bg-blue-50" },
        docx: { label: "DOCX", color: "text-blue-600 border-blue-200 bg-blue-50" },
        doc: { label: "DOC", color: "text-blue-600 border-blue-200 bg-blue-50" },
        csv: { label: "CSV", color: "text-green-600 border-green-200 bg-green-50" },
        json: { label: "JSON", color: "text-amber-600 border-amber-200 bg-amber-50" },
        xml: { label: "XML", color: "text-orange-600 border-orange-200 bg-orange-50" },
        yaml: { label: "YAML", color: "text-purple-600 border-purple-200 bg-purple-50" },
        yml: { label: "YAML", color: "text-purple-600 border-purple-200 bg-purple-50" },
        html: { label: "HTML", color: "text-orange-600 border-orange-200 bg-orange-50" },
        htm: { label: "HTML", color: "text-orange-600 border-orange-200 bg-orange-50" },
        py: { label: "Python", color: "text-yellow-600 border-yellow-200 bg-yellow-50" },
        js: { label: "JS", color: "text-yellow-600 border-yellow-200 bg-yellow-50" },
        ts: { label: "TS", color: "text-blue-600 border-blue-200 bg-blue-50" },
        tsx: { label: "TSX", color: "text-blue-600 border-blue-200 bg-blue-50" },
        jsx: { label: "JSX", color: "text-yellow-600 border-yellow-200 bg-yellow-50" },
        zip: { label: "ZIP", color: "text-violet-600 border-violet-200 bg-violet-50" },
    }
    return map[ext] || { label: ext.toUpperCase() || "FILE", color: "text-neutral-600 border-neutral-200 bg-neutral-50" }
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

    // Recursively read all files from a dropped directory
    const readDirectoryEntries = useCallback(async (dirEntry: FileSystemDirectoryEntry): Promise<File[]> => {
        const files: File[] = []
        const reader = dirEntry.createReader()
        const readBatch = (): Promise<FileSystemEntry[]> =>
            new Promise((resolve, reject) => reader.readEntries(resolve, reject))

        let batch: FileSystemEntry[]
        do {
            batch = await readBatch()
            for (const entry of batch) {
                if (entry.isFile) {
                    const file = await new Promise<File>((resolve, reject) =>
                        (entry as FileSystemFileEntry).file(resolve, reject)
                    )
                    // Attach relative path
                    Object.defineProperty(file, 'webkitRelativePath', {
                        value: entry.fullPath.replace(/^\//, ''),
                        writable: false,
                    })
                    files.push(file)
                } else if (entry.isDirectory) {
                    const subFiles = await readDirectoryEntries(entry as FileSystemDirectoryEntry)
                    files.push(...subFiles)
                }
            }
        } while (batch.length > 0)
        return files
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)

        // Check if any dropped item is a directory
        const items = e.dataTransfer.items
        if (items && items.length > 0) {
            const droppedFiles: File[] = []
            let hasDirectory = false

            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry?.()
                if (entry?.isDirectory) {
                    hasDirectory = true
                    const dirFiles = await readDirectoryEntries(entry as FileSystemDirectoryEntry)
                    droppedFiles.push(...dirFiles)
                } else if (entry?.isFile) {
                    const file = await new Promise<File>((resolve, reject) =>
                        (entry as FileSystemFileEntry).file(resolve, reject)
                    )
                    droppedFiles.push(file)
                }
            }

            if (droppedFiles.length > 0) {
                handleFiles(droppedFiles)
                return
            }
        }

        // Fallback to regular file handling
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files)
        }
    }, [handleFiles, readDirectoryEntries])

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
                        ? "border-blue-400 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                )}
            >
                <Upload className={cn(compact ? "w-5 h-5" : "w-6 h-6", dragOver ? "text-blue-600" : "text-gray-400")} />

                {uploading ? (
                    <p className="text-[11px] text-gray-500">Uploading...</p>
                ) : uploadedFileName ? (
                    <div className="flex flex-col items-center gap-1">
                        <p className="text-[11px] text-gray-700">{uploadedFileName}</p>
                        {uploadSuccess && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-600 bg-emerald-50">
                                Uploaded
                            </span>
                        )}
                    </div>
                ) : (
                    <>
                        <p className="text-[11px] text-gray-500 text-center px-4">
                            {helpText || defaultHelp}
                            {allowFolder && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        if (folderInputRef.current) {
                                            folderInputRef.current.value = ""
                                            folderInputRef.current.click()
                                        }
                                    }}
                                    className="ml-1 text-blue-600 hover:text-blue-700 underline underline-offset-2"
                                >
                                    or select a folder
                                </button>
                            )}
                        </p>
                        <p className="text-[9px] text-gray-400 text-center px-4">
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

            {/* Hidden folder input */}
            {allowFolder && (
                <input
                    ref={folderInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                            handleFiles(e.target.files)
                        }
                    }}
                    {...{ webkitdirectory: "", directory: "", mozdirectory: "" } as any}
                />
            )}

            {/* Upload type summary */}
            {uploadType === "zip" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200">
                    <FileArchive className="w-4 h-4 text-violet-600 shrink-0" />
                    <span className="text-[11px] text-violet-600">
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
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                    <Folder className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-[11px] text-blue-600">
                        Folder - {entries.length} file{entries.length !== 1 ? "s" : ""} selected
                    </span>
                </div>
            )}

            {uploadType === "single" && entries.length === 1 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                    {(() => {
                        const Icon = getFileIcon(entries[0].name)
                        return <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                    })()}
                    <span className="text-[11px] text-gray-700 truncate flex-1">{entries[0].name}</span>
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border", getFileTypeBadge(entries[0].name).color)}>
                        {getFileTypeBadge(entries[0].name).label}
                    </span>
                    <span className="text-[9px] text-gray-500">{formatFileSize(entries[0].file.size)}</span>
                </div>
            )}

            {/* File list with checkboxes for ZIP / folder */}
            {showFileList && (uploadType === "zip" || uploadType === "folder") && entries.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                    {/* Select all header */}
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
                        <button onClick={() => toggleAll(selectedCount < entries.length)} className="text-gray-500 hover:text-gray-900 transition-colors">
                            {selectedCount === entries.length
                                ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                                : <Square className="w-3.5 h-3.5" />
                            }
                        </button>
                        <span className="text-[9px] text-gray-500">
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
                                        "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 transition-colors",
                                        !entry.selected && "opacity-50"
                                    )}
                                >
                                    {entry.selected
                                        ? <CheckSquare className="w-3 h-3 text-blue-600 shrink-0" />
                                        : <Square className="w-3 h-3 text-gray-400 shrink-0" />
                                    }
                                    <Icon className="w-3 h-3 text-gray-500 shrink-0" />
                                    <span className="text-[10px] text-gray-700 truncate flex-1">{entry.name}</span>
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
