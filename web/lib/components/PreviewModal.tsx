import React from "react";
import CommonModal from "./CommonModal";

interface IPreviewModalProps {
    isVisible: boolean;
    onClose: () => void;
    fileName: string;
    fileUrl: string;
}

const PreviewModal: React.FC<IPreviewModalProps> = ({
    isVisible,
    onClose,
    fileName,
    fileUrl,
}) => {
    const extension = fileName.split(".").pop()?.toLowerCase() || "";

    const renderPreview = () => {
        if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension)) {
            return (
                <div className="rfm-preview-content">
                    <img src={fileUrl} alt={fileName} className="rfm-preview-image" />
                </div>
            );
        }

        if (["mp4", "webm", "ogg"].includes(extension)) {
            return (
                <div className="rfm-preview-content">
                    <video controls className="rfm-preview-video">
                        <source src={fileUrl} />
                        Your browser does not support the video tag.
                    </video>
                </div>
            );
        }

        if (["mp3", "wav", "ogg"].includes(extension)) {
            return (
                <div className="rfm-preview-content">
                    <audio controls className="rfm-preview-audio">
                        <source src={fileUrl} />
                        Your browser does not support the audio element.
                    </audio>
                </div>
            );
        }

        if (extension === "pdf") {
            return (
                <div className="rfm-preview-content">
                    <iframe src={fileUrl} className="rfm-preview-pdf" title={fileName} />
                </div>
            );
        }

        return (
            <div className="rfm-preview-no-support">
                Preview not available for this file type.
                <br />
                <a href={fileUrl} download={fileName} className="rfm-btn-primary mt-4 inline-block">
                    Download File
                </a>
            </div>
        );
    };

    return (
        <CommonModal isVisible={isVisible} onClose={onClose} title={`Preview: ${fileName}`}>
            {renderPreview()}
        </CommonModal>
    );
};

export default PreviewModal;
