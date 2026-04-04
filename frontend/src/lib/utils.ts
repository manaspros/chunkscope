import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatRelativeTime(dateString: string): string {
    const now = Date.now();
    const then = new Date(dateString).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return 'yesterday';
    if (diffDay < 30) return `${diffDay} days ago`;
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth}mo ago`;
    const diffYear = Math.floor(diffDay / 365);
    return `${diffYear}y ago`;
}

export function getErrorMessage(error: any): string {
    if (!error) return 'An unknown error occurred';

    if (typeof error === 'string') return error;

    // Handle FastAPI/Pydantic validation errors (often a list of error objects)
    if (Array.isArray(error)) {
        return error.map(err => {
            if (typeof err === 'string') return err;
            if (err && typeof err === 'object' && err.msg) return err.msg;
            return JSON.stringify(err);
        }).join('. ');
    }

    // Handle objects with msg or message fields
    if (typeof error === 'object') {
        if (error.msg) return error.msg;
        if (error.message) return error.message;
        if (error.detail) return getErrorMessage(error.detail);
        try {
            return JSON.stringify(error);
        } catch {
            return 'An unparseable error occurred';
        }
    }

    return String(error);
}
