import React, { useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import CommonModal from "./CommonModal";
import getCroppedImg from "../../utils/cropImage";

interface IAvatarCropModalProps {
  isVisible: boolean;
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedImage: Blob) => void;
}

const AvatarCropModal: React.FC<IAvatarCropModalProps> = ({
  isVisible,
  imageSrc,
  onClose,
  onCropComplete,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Reset crop/zoom when a new image is loaded
  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, [imageSrc]);

  const onCropChange = (crop: any) => {
    setCrop(crop);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onCropAreaChange = useCallback((_: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    try {
      if (croppedAreaPixels) {
        const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
        if (croppedImage) {
          onCropComplete(croppedImage);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <CommonModal
      title="Crop Avatar"
      isVisible={isVisible}
      onClose={onClose}
      centered
      className="avatar-crop-modal"
    >
      <div
        className="cropper-container"
        style={{
          position: "relative",
          height: "300px",
          width: "100%",
          background: "#333",
        }}
      >
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={onCropChange}
          onCropComplete={onCropAreaChange}
          onZoomChange={onZoomChange}
        />
      </div>
      <div className="cropper-controls" style={{ padding: "15px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "15px",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Zoom
          </span>
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-labelledby="Zoom"
            onChange={(e) => onZoomChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
        >
          <button
            className="register-btn"
            onClick={onClose}
            style={{ padding: "8px 16px", fontSize: "14px" }}
          >
            Cancel
          </button>
          <button
            className="login-btn"
            onClick={handleSave}
            style={{ padding: "8px 24px", fontSize: "14px" }}
          >
            Save
          </button>
        </div>
      </div>
    </CommonModal>
  );
};

export default AvatarCropModal;
