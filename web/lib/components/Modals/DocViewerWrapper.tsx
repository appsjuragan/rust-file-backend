import React from "react";
import DocViewer, { DocViewerRenderers } from "react-doc-viewer";

interface IDocViewerWrapperProps {
    url: string;
    fileName: string;
    mimeType?: string;
}

const DocViewerWrapper: React.FC<IDocViewerWrapperProps> = ({ url, fileName, mimeType }) => {
    const docs = [
        {
            uri: url,
            fileName: fileName,
            fileType: mimeType,
        },
    ];

    // Filter renderers to avoid using external Microsoft/Google viewers for Office files,
    // as we handle those locally via docx-preview/xlsx in LocalOfficeViewer.
    const filteredRenderers = DocViewerRenderers.filter(r =>
        !r.name?.includes("MSDoc") && !r.name?.includes("Google")
    );

    return (
        <div className="rfm-doc-viewer-container">
            <DocViewer
                documents={docs}
                pluginRenderers={filteredRenderers}
                theme={{
                    primary: "#3b82f6",
                    secondary: "#ffffff",
                    tertiary: "#f3f4f6",
                    text_primary: "#1f2937",
                    text_secondary: "#4b5563",
                    text_tertiary: "#9ca3af",
                    disableThemeScrollbar: false,
                }}
                config={{
                    header: {
                        disableHeader: true,
                        disableFileName: true,
                        retainURLParams: true,
                    },
                }}
                style={{ height: "100%", width: "100%" }}
            />
        </div>
    );
};

export default DocViewerWrapper;
