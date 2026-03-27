import React, { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import * as XLSX from "xlsx";
import "./LocalOfficeViewer.css";

interface ILocalOfficeViewerProps {
    url: string;
    fileName: string;
    extension: string;
}

const LocalOfficeViewer: React.FC<ILocalOfficeViewerProps> = ({ url, fileName, extension }) => {
    const docxContainerRef = useRef<HTMLDivElement>(null);
    const [xlsxData, setXlsxData] = useState<any[][] | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Step 1: Fetch the file
    useEffect(() => {
        const fetchFile = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem("token") || localStorage.getItem("auth_token");
                const headers: Record<string, string> = {};
                if (token) headers["Authorization"] = `Bearer ${token}`;

                const response = await fetch(url, { headers });
                if (!response.ok) {
                    throw new Error(`Fetch failed: ${response.status}`);
                }
                const data = await response.blob();
                setBlob(data);
            } catch (err: any) {
                console.error("[LocalOfficeViewer] Fetch error:", err);
                setError(err.message || "Failed to fetch document");
                setLoading(false);
            }
        };

        fetchFile();
    }, [url]);

    // Step 2: Render content after fetch and DOM is ready
    useEffect(() => {
        if (!blob) return;

        const renderContent = async () => {
            try {
                if (extension === "docx" || blob.type.includes("wordprocessingml")) {
                    if (docxContainerRef.current) {
                        docxContainerRef.current.innerHTML = "";
                        await renderAsync(blob, docxContainerRef.current, undefined, {
                            className: "docx-rendered",
                            inWrapper: true,
                            ignoreLastRenderedPageBreak: true,
                        });
                        setLoading(false);
                    } else {
                        // Ref not ready yet, will retry on next effect run
                    }
                } else if (extension === "xlsx" || extension === "xls" || blob.type.includes("spreadsheetml")) {
                    const arrayBuffer = await blob.arrayBuffer();
                    const workbook = XLSX.read(arrayBuffer, { type: "array" });
                    const firstSheetName = workbook.SheetNames[0];
                    if (firstSheetName) {
                        const worksheet = workbook.Sheets[firstSheetName];
                        if (worksheet) {
                            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                            setXlsxData(jsonData);
                        }
                    }
                    setLoading(false);
                } else {
                    setError(`Unsupported file type: .${extension}`);
                    setLoading(false);
                }
            } catch (err: any) {
                console.error("[LocalOfficeViewer] Render error:", err);
                setError(`Render error: ${err.message}`);
                setLoading(false);
            }
        };

        renderContent();
    }, [blob, extension]); // Should re-run if blob is set OR if extension changes

    if (error) {
        return <div className="rfm-local-office-error">{error}</div>;
    }

    return (
        <div className="rfm-local-office-viewer">
            {loading && (
                <div className="rfm-local-office-loading">
                    <div className="spinner mr-2" />
                    Preparing document...
                </div>
            )}

            {(extension === "docx" || (blob && blob.type.includes("wordprocessingml"))) && (
                <div
                    ref={docxContainerRef}
                    className="rfm-docx-container"
                    style={{ visibility: loading ? "hidden" : "visible" }}
                />
            )}

            {(extension === "xlsx" || extension === "xls") && xlsxData && !loading && (
                <div className="rfm-xlsx-container">
                    <table className="rfm-xlsx-table">
                        <thead>
                            <tr>
                                {xlsxData[0]?.map((cell, idx) => (
                                    <th key={idx}>{cell || ""}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {xlsxData.slice(1, 100).map((row, rowIdx) => (
                                <tr key={rowIdx}>
                                    {row.map((cell, cellIdx) => (
                                        <td key={cellIdx}>{cell || ""}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default LocalOfficeViewer;
