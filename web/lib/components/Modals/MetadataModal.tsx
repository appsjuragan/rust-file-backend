import React from "react";
import CommonModal from "./CommonModal";
import { FileType } from "../../types";
import SvgIcon from "../Icons/SvgIcon";

const METADATA_LABELS: Record<string, string> = {
  date: "Date",
  date_digitized: "Date Digitized",
  original_date: "Original Date",
  exposure_time: "Exposure Time",
  focal_length: "Focal Length",
  f_number: "F-Number",
  gps_altitude: "GPS Altitude",
  gps_latitude: "GPS Latitude",
  gps_longitude: "GPS Longitude",
  gps_direction: "GPS Direction",
  gps_date: "GPS Date",
  gps_time: "GPS Time",
  image_width: "Image Width",
  image_length: "Image Length",
  camera_make: "Camera Make",
  camera_model: "Camera Model",
  orientation: "Orientation",
  photographic_sensitivity: "Photographic Sensitivity",
  x_dimension: "X Dimension",
  y_dimension: "Y Dimension",
  user_comment: "User Comment",
  white_balance: "White Balance",
  x_resolution: "X Resolution",
  y_resolution: "Y Resolution",
};

interface IMetadataModalProps {
  isVisible: boolean;
  onClose: () => void;
  file: FileType | null;
  clickPosition?: { x: number; y: number } | null;
}

const MetadataModal: React.FC<IMetadataModalProps> = ({
  isVisible,
  onClose,
  file,
  clickPosition,
}) => {
  if (!file) return null;

  const formatSize = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return "--";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getGpsCoords = () => {
    if (!file.extraMetadata) return null;
    const lat = file.extraMetadata.gps_latitude;
    const lon = file.extraMetadata.gps_longitude;
    if (typeof lat === "number" && typeof lon === "number") {
      return { lat, lon };
    }
    return null;
  };

  const showLocation = () => {
    const coords = getGpsCoords();
    if (coords) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}`,
        "_blank",
      );
    }
  };

  const handleShare = () => {
    // If Web Share API is available
    if (navigator.share) {
      navigator.share({
        title: file.name,
        text: `Check out this file: ${file.name}`,
        url: window.location.href, // Or a specific share link if available
      }).catch(console.error);
    } else {
      // Fallback: Copy URL to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
    }
  };

  const renderMetadataRow = (label: string, value: any) => {
    if (value === undefined || value === null || value === "") return null;
    let displayValue = value;
    if (typeof value === "object") {
      displayValue = JSON.stringify(value);
    }
    return (
      <div className="rfm-metadata-rv-row" key={label}>
        <span className="rfm-metadata-rv-label">{label}:</span>
        <span className="rfm-metadata-rv-value">{displayValue}</span>
      </div>
    );
  };

  const coords = getGpsCoords();

  return (
    <CommonModal
      isVisible={isVisible}
      onClose={onClose}
      title="Metadata"
      className="rfm-metadata-revamp-modal"
      autoHeight
      clickPosition={clickPosition}
    >
      <div className="rfm-metadata-revamp-content">
        <div className="rfm-metadata-rv-list">
          {renderMetadataRow("Name", file.name)}
          {renderMetadataRow("Size", file.isDir ? "--" : formatSize(file.size))}
          {renderMetadataRow("Type", file.isDir ? "Folder" : file.mimeType || "Unknown")}

          {file.extraMetadata && Object.entries(file.extraMetadata).map(([key, value]) => {
            const label = METADATA_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return renderMetadataRow(label, value);
          })}

          {file.isShared && (
            <>
              <div className="rfm-metadata-rv-divider" />
              {renderMetadataRow("Shared By", file.sharedBy || "System")}
              {renderMetadataRow("Permissions", file.permission === "view" ? "View Only" : "View & Download")}
              {file.expiresAt && renderMetadataRow("Time Left", formatTimeLeft(file.expiresAt))}
            </>
          )}
        </div>

        <div className="rfm-metadata-rv-actions">
          <button className="rfm-metadata-rv-btn" onClick={handleShare}>
            <SvgIcon svgType="share" size={16} className="mr-2" />
            Share
          </button>
          {coords && (
            <button className="rfm-metadata-rv-btn" onClick={showLocation}>
              <SvgIcon svgType="map-pin" size={16} className="mr-2" />
              Show Location
            </button>
          )}
          <button className="rfm-metadata-rv-btn is-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </CommonModal>
  );
};

const formatTimeLeft = (expiresAt: string) => {
  try {
    const expires = new Date(expiresAt).getTime();
    const now = Date.now();
    const diff = expires - now;
    if (diff <= 0) return "Expired";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? "s" : ""} left`;
    }
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  } catch {
    return "N/A";
  }
};

export default MetadataModal;
