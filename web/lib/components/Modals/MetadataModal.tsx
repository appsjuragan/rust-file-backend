import React from "react";
import CommonModal from "./CommonModal";
import { FileType } from "../../types";
import SvgIcon from "../Icons/SvgIcon";

interface IMetadataModalProps {
    isVisible: boolean;
    onClose: () => void;
    file: FileType | null;
    clickPosition?: { x: number; y: number } | null;
}

const MetadataModal: React.FC<IMetadataModalProps> = ({ isVisible, onClose, file, clickPosition }) => {
    if (!file) return null;

    const formatSize = (bytes?: number) => {
        if (bytes === undefined || bytes === null) return '--';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <CommonModal isVisible={isVisible} onClose={onClose} title="File Metadata" className="rfm-metadata-modal" autoHeight clickPosition={clickPosition}>
            <div className="rfm-metadata-form">
                <div className="rfm-form-group">
                    <label>Name</label>
                    <input type="text" value={file.name} readOnly />
                </div>
                <div className="rfm-form-group">
                    <label>Size</label>
                    <input type="text" value={file.isDir ? '--' : formatSize(file.size)} readOnly />
                </div>
                <div className="rfm-form-group">
                    <label>Type</label>
                    <input type="text" value={file.isDir ? 'Folder' : (file.mimeType || 'Unknown')} readOnly />
                </div>
                <div className="rfm-form-group">
                    <label>Scan Status</label>
                    <div className="mt-1">
                        <span className={`rfm-status-badge is-${file.scanStatus || 'unchecked'}`}>
                            <SvgIcon svgType="shield" className="w-3.5 h-3.5 mr-1" />
                            {file.scanStatus || 'unchecked'}
                        </span>
                    </div>
                </div>
                {file.extraMetadata && (
                    <div className="rfm-form-group">
                        <label>Extra Metadata</label>
                        <pre className="rfm-metadata-json">
                            {JSON.stringify(file.extraMetadata, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </CommonModal>
    );
};

export default MetadataModal;
