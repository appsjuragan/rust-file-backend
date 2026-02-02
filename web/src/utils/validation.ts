export const BLOCKED_EXTENSIONS = [
    "exe", "dll", "so", "dylib", "bin", "com", "bat", "cmd", "ps1", "sh", "bash",
    "js", "ts", "jsx", "tsx", "py", "pyw", "rb", "php", "pl", "cgi", "asp", "aspx", "jsp", "jspx",
    "cfm", "go", "rs", "java", "class", "jar", "war", "c", "cpp", "h", "hpp", "cs", "vb", "vbs",
    "lua", "r", "swift", "kt", "scala", "groovy", "html", "htm", "xhtml", "shtml", "svg", "xml", "xsl", "xslt",
    "htaccess", "htpasswd", "json", "yaml", "yml", "toml", "ini", "conf", "config",
    "iso", "img", "vmdk", "vhd", "ova", "ovf",
    "docm", "xlsm", "pptm", "dotm", "xltm", "potm",
];

export const isRestrictedFile = (filename: string): { restricted: boolean; reason?: string } => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext && BLOCKED_EXTENSIONS.includes(ext)) {
        return {
            restricted: true,
            reason: `File extension '.${ext}' is restricted for security reasons.`
        };
    }
    return { restricted: false };
};
