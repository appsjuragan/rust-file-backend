import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { FileType } from '../../types';
import { formatSize, formatMimeType } from '../../utils/fileUtils';
import SvgIcon from '../Icons/SvgIcon';

const columnHelper = createColumnHelper<FileType>();

export const getColumns = () => [
    columnHelper.accessor('name', {
        header: () => 'Name',
        cell: info => {
            const isPending = info.row.original.scanStatus === 'pending' || info.row.original.scanStatus === 'scanning';
            const isScanning = info.row.original.scanStatus === 'scanning';
            const isInfected = info.row.original.scanStatus === 'infected';

            if (isInfected) {
                const expiresAt = info.row.original.expiresAt;
                let timeLeft = 'soon';
                if (expiresAt) {
                    const diff = new Date(expiresAt).getTime() - Date.now();
                    const minutes = Math.ceil(diff / 60000);
                    if (minutes > 0) timeLeft = `${minutes}min`;
                }

                return (
                    <div className="rfm-workspace-list-icon-td">
                        <SvgIcon svgType={info.row.original.isDir ? "folder" : "file"} className="rfm-workspace-list-icon text-gray-500" />
                        <p className="line-through opacity-70 mr-2">{info.getValue()}</p>
                        <span className="flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#423628] text-[#cfa87d] border border-[#6b563f] whitespace-nowrap">
                            ! Suspicious: {timeLeft}
                        </span>
                    </div>
                );
            }

            return (
                <div className={`rfm-workspace-list-icon-td ${isPending ? 'rfm-pending' : ''}`}>
                    <SvgIcon svgType={info.row.original.isDir ? "folder" : "file"} className="rfm-workspace-list-icon" />
                    <p>{info.getValue()}</p>
                    {isPending && (
                        <span className="rfm-scanning-badge">
                            {isScanning && <SvgIcon svgType="cog" className="rfm-spinner-small animate-spin inline-block mr-1" style={{ width: '12px', height: '12px' }} />}
                            {isScanning ? 'Antivirus scan...' : 'AV Pending...'}
                        </span>
                    )}
                </div>
            );
        },
    }),
    columnHelper.accessor('size', {
        header: () => 'Size',
        cell: info => info.row.original.isDir ? '--' : formatSize(info.getValue() || 0),
    }),
    columnHelper.accessor('mimeType', {
        header: () => 'Type',
        cell: info => info.row.original.isDir ? 'Folder' : formatMimeType(info.getValue()),
    }),
    columnHelper.accessor('lastModified', {
        header: () => 'Last Modified',
        cell: info => info.getValue() ? new Date((info.getValue() as number) * 1000).toLocaleString() : 'N/A',
    }),
];
