import React from "react";

interface ISvgIconProps extends React.AllHTMLAttributes<HTMLDivElement> {
  svgType: "file" | "folder" | "arrow-up" | "arrow-down" | "close" | "list" | "icons" | "download" | "info" | "eye" | "scissors" | "trash" | "clipboard" | "edit" | "plus" | "upload" | "check" | "home";
}

const SvgIcon: React.FC<ISvgIconProps> = ({
  svgType,
  ...props
}: ISvgIconProps) => {
  const svgContent = () => {
    switch (svgType) {
      case "home": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"></path>
          </svg>
        );
      }
      case "file": {
        return (
          <svg
            className="w-full h-full"
            version="1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            enableBackground="new 0 0 48 48"
          >
            <polygon fill="#90CAF9" points="40,45 8,45 8,3 30,3 40,13" />
            <polygon fill="#E1F5FE" points="38.5,14 29,14 29,4.5" />
          </svg>
        );
      }
      case "folder": {
        return (
          <svg
            className="w-full h-full"
            version="1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            enableBackground="new 0 0 48 48"
          >
            <path
              fill="#FFA000"
              d="M40,12H22l-4-4H8c-2.2,0-4,1.8-4,4v8h40v-4C44,13.8,42.2,12,40,12z"
            />
            <path
              fill="#FFCA28"
              d="M40,12H8c-2.2,0-4,1.8-4,4v20c0,2.2,1.8,4,4,4h32c2.2,0,4-1.8,4-4V16C44,13.8,42.2,12,40,12z"
            />
          </svg>
        );
      }
      case "arrow-up": {
        return (
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 1024 1024">
            <path d="M868 545.5L536.1 163a31.96 31.96 0 0 0-48.3 0L156 545.5a7.97 7.97 0 0 0 6 13.2h81c4.6 0 9-2 12.1-5.5L474 300.9V864c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V300.9l218.9 252.3c3 3.5 7.4 5.5 12.1 5.5h81c6.8 0 10.5-8 6-13.2z" />
          </svg>
        );
      }
      case "arrow-down": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
            <path d="M862 465.3h-81c-4.6 0-9 2-12.1 5.5L550 723.1V160c0-4.4-3.6-8-8-8h-60c-4.4 0-8 3.6-8 8v563.1L255.1 470.8c-3-3.5-7.4-5.5-12.1-5.5h-81c-6.8 0-10.5 8.1-6 13.2L487.9 861a31.96 31.96 0 0 0 48.3 0L868 478.5c4.5-5.2.8-13.2-6-13.2z">
            </path>
          </svg>
        )
      }
      case "close": {
        return (
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="currentColor">
            <path d="M563.8 512l262.5-312.9c4.4-5.2.7-13.1-6.1-13.1h-79.8c-4.7 0-9.2 2.1-12.3 5.7L511.6 449.8 295.1 191.7c-3-3.6-7.5-5.7-12.3-5.7H203c-6.8 0-10.5 7.9-6.1 13.1L459.4 512 196.9 824.9A7.95 7.95 0 0 0 203 838h79.8c4.7 0 9.2-2.1 12.3-5.7l216.5-258.1 216.5 258.1c3 3.6 7.5 5.7 12.3 5.7h79.8c6.8 0 10.5-7.9 6.1-13.1L563.8 512z" />
          </svg>
        );
      }
      case "list": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
            <path d="M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z">
            </path>
          </svg>
        )
      }
      case "icons": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
            <path d="M72,60A12,12,0,1,1,60,48,12,12,0,0,1,72,60Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,128,48Zm68,24a12,12,0,1,0-12-12A12,12,0,0,0,196,72ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Zm68,0a12,12,0,1,0,12,12A12,12,0,0,0,128,116Zm68,0a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,184a12,12,0,1,0,12,12A12,12,0,0,0,60,184Zm68,0a12,12,0,1,0,12,12A12,12,0,0,0,128,184Zm68,0a12,12,0,1,0,12,12A12,12,0,0,0,196,184Z">
            </path>
          </svg>
        )
      }
      case "download": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path>
          </svg>
        )
      }
      case "info": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path>
          </svg>
        )
      }
      case "eye": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"></path>
          </svg>
        )
      }
      case "scissors": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z"></path>
          </svg>
        )
      }
      case "trash": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>
          </svg>
        )
      }
      case "clipboard": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"></path>
          </svg>
        )
      }
      case "edit": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path>
          </svg>
        )
      }
      case "plus": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path>
          </svg>
        )
      }
      case "upload": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"></path>
          </svg>
        )
      }
      case "check": {
        return (
          <svg className="w-full h-full" stroke="currentColor" fill="currentColor" strokeWidth="3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" />
          </svg>
        )
      }
      default: {
        return "";
      }
    }
  };

  return <div {...props} className={`flex items-center justify-center ${props.className || ""}`}>{svgContent()}</div>;
};

export default SvgIcon;
