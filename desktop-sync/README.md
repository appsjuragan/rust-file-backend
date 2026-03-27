# AppJuragan Sync Client

This directory contains the source code for the AppJuragan Desktop Sync Client, a companion .NET application to the Rust File Backend.

It provides automatic, best-effort two-way synchronization of a designated local folder (`%UserProfile%\AppJuragan` by default) with the user's remote files.

## Components

The solution comprises two projects:
1. **AppJuragan.SyncClient**: The main WPF desktop application running in the system tray.
2. **AppJuragan.ShellExtension**: An in-process COM server that integrates with Windows Explorer to provide visual icon overlays (green check marks for synced, blue linking for shared, yellow star for favorites).

## Prerequisites

- [.NET 8.0 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/8.0)
- Windows 10/11 x64

## Building & Running

1. **Install SDK**: If you haven't already, install the .NET 8.0 SDK.
2. **Build and Run**:
   From a PowerShell or Command Prompt in the `desktop-sync` directory, run:
   ```cmd
   dotnet build src\AppJuragan.SyncClient\AppJuragan.SyncClient.csproj -c Release
   dotnet run --project src\AppJuragan.SyncClient\AppJuragan.SyncClient.csproj -c Release
   ```
   *Note: Because the .NET Core API requires Windows Forms or WPF tooling to be present, you must use `dotnet build` rather than rely strictly on a text editor.*

## Features Implemented

* **Device Authentication (OTP)**: Seamless login leveraging the backend's `/auth/device` endpoints.
* **Smart Two-Way Sync**: A reliable engine (`SyncEngine.cs`) that handles downloads, uploads, and **two-way deletions**. If you delete locally, it deletes on the cloud; if it's deleted elsewhere, it's removed locally.
* **Premium Dark Mode UI**: Modern WPF interface with a glassmorphism aesthetic, custom scrollbars, and consistent brand colors matching the web frontend.
* **Custom System Tray & Tooltip**: High-fidelity dark-mode tray tooltip with real-time status updates and branded status icons.
* **Smart Hashing**: Employs MD5 checks via `SyncStateStore.cs` against local files to determine if uploading chunks is required.
* **Optimized Shutdown**: Instant tray icon disposal and safe engine termination with a 3-second timeout for a snappy user experience.
* **Shell Integration**: Visual icon overlays (green check marks for synced, blue linking for shared, yellow star for favorites).
* **Public Share Links**: Direct access to public share URLs from the sync window with "Copy Link" capability.
* **Storage Context**: Automatic mapping of system folder names (e.g., .Trash -> Trash) for consistent UX.

## Troubleshooting

- **Icon Overlays Missing**: Windows strictly limits the number of overlay icons system-wide to 15. If Dropbox, OneDrive, or similar software uses these up, the Shell extension registrar adds three spaces (`   AppJuragan`) to cheat the alphabetical sorting rank. Restart `explorer.exe` or sign out and in if they aren't appearing immediately.
- **Settings Crash**: If the app fails to open the Settings window, check that the `.NET 8.0 Desktop Runtime` is installed.
- **Login OTP fails**: Make sure the backend project is running locally, and ensure your web front-end is logged in.
