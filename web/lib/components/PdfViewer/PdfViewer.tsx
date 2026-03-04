import React, { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./PdfViewer.css";

// Configure pdfjs worker from CDN to avoid bundling issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PdfViewerProps {
    /** URL to the PDF file (same-origin ticket URL to avoid CORS) */
    url: string;
    /** Optional class name for the container */
    className?: string;
    /** Disable context menu (right-click) */
    disableContextMenu?: boolean;
}

const PdfViewer: React.FC<PdfViewerProps> = ({
    url,
    className = "",
    disableContextMenu = true,
}) => {
    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [scale, setScale] = useState<number>(1);
    const [containerWidth, setContainerWidth] = useState<number>(600);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Observe container width for responsive sizing
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                if (width > 0) {
                    setContainerWidth(width);
                }
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    const onDocumentLoadSuccess = useCallback(
        ({ numPages: total }: { numPages: number }) => {
            setNumPages(total);
            setLoading(false);
            setError(null);
        },
        [],
    );

    const onDocumentLoadError = useCallback((err: Error) => {
        console.error("PDF load error:", err);
        setError("Failed to load PDF. The file may be corrupted or inaccessible.");
        setLoading(false);
    }, []);

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (disableContextMenu) {
                e.preventDefault();
                return false;
            }
        },
        [disableContextMenu],
    );

    const goToPage = useCallback(
        (page: number) => {
            const clamped = Math.max(1, Math.min(page, numPages));
            setCurrentPage(clamped);
            // Scroll to the page
            const pageEl = document.getElementById(`pdf-page-${clamped}`);
            if (pageEl) {
                pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        },
        [numPages],
    );

    const zoomIn = useCallback(
        () => setScale((s) => Math.min(s + 0.25, 3)),
        [],
    );
    const zoomOut = useCallback(
        () => setScale((s) => Math.max(s - 0.25, 0.5)),
        [],
    );
    const resetZoom = useCallback(() => setScale(1), []);

    // Track current page from scroll
    const handleScroll = useCallback(() => {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer || numPages === 0) return;

        const scrollTop = scrollContainer.scrollTop;
        const containerHeight = scrollContainer.clientHeight;

        for (let i = 1; i <= numPages; i++) {
            const pageEl = document.getElementById(`pdf-page-${i}`);
            if (!pageEl) continue;
            const rect = pageEl.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            const relativeTop = rect.top - containerRect.top;

            if (relativeTop <= containerHeight / 2 && relativeTop + rect.height > 0) {
                setCurrentPage(i);
            }
        }
    }, [numPages]);

    // Compute an appropriate width for the pages
    const pageWidth = Math.min(containerWidth - 32, 900) * scale;

    if (error) {
        return (
            <div className={`rfm-pdf-viewer ${className}`} ref={containerRef}>
                <div className="rfm-pdf-error">
                    <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`rfm-pdf-viewer ${className}`}
            ref={containerRef}
            onContextMenu={handleContextMenu}
        >
            {/* Toolbar */}
            {!loading && numPages > 0 && (
                <div className="rfm-pdf-toolbar">
                    <div className="rfm-pdf-toolbar-group">
                        <button
                            className="rfm-pdf-toolbar-btn"
                            onClick={zoomOut}
                            disabled={scale <= 0.5}
                            title="Zoom Out"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                        </button>
                        <button
                            className="rfm-pdf-toolbar-btn rfm-pdf-zoom-label"
                            onClick={resetZoom}
                            title="Reset Zoom"
                        >
                            {Math.round(scale * 100)}%
                        </button>
                        <button
                            className="rfm-pdf-toolbar-btn"
                            onClick={zoomIn}
                            disabled={scale >= 3}
                            title="Zoom In"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="11" y1="8" x2="11" y2="14" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                        </button>
                    </div>

                    <div className="rfm-pdf-toolbar-group">
                        <button
                            className="rfm-pdf-toolbar-btn"
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage <= 1}
                            title="Previous Page"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>
                        <span className="rfm-pdf-page-info">
                            {currentPage} / {numPages}
                        </span>
                        <button
                            className="rfm-pdf-toolbar-btn"
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage >= numPages}
                            title="Next Page"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* PDF Document */}
            <div
                className="rfm-pdf-scroll-container"
                ref={scrollContainerRef}
                onScroll={handleScroll}
            >
                {loading && (
                    <div className="rfm-pdf-loading">
                        <div className="rfm-pdf-loading-spinner" />
                        <span>Loading PDF...</span>
                    </div>
                )}
                <Document
                    file={url}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={null}
                    className="rfm-pdf-document"
                >
                    {Array.from({ length: numPages }, (_, i) => (
                        <div key={i} id={`pdf-page-${i + 1}`} className="rfm-pdf-page-wrapper">
                            <Page
                                pageNumber={i + 1}
                                width={pageWidth}
                                renderTextLayer={true}
                                renderAnnotationLayer={true}
                                className="rfm-pdf-page"
                            />
                        </div>
                    ))}
                </Document>
            </div>
        </div>
    );
};

export default PdfViewer;
