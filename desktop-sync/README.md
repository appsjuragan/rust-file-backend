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

* **Device Authentication (OTP)**: Seamless login leveraging the backend's `/auth/device` endpoints. The desktop opens a 6-digit code which the user approves inside their active web session online.
* **Sync Engine**: A reliable sync engine (`SyncEngine.cs`) utilizing a continuous background `System.Timers.Timer` to reconcile local filesystem state with the `ApiClient` fetch of remote lists.
* **Smart Hashing**: Employs MD5 checks via `SyncStateStore.cs` against local files to determine if uploading chunks to the `xxhash`-backed rust backend is required.
* **Persistent Settings**: DPAPI keeps the JWT tied to the Windows profile gracefully (`AuthService.cs`).
* **Shell Integration**: Includes a built-in static registrar `ShellOverlayRegistrar.cs` to inject CLSIDs bridging the `.NET` COM server (`OverlayHandlers.cs`).
* **System Tray**: Complete tray-icon controls providing passive sync status (Idle, Syncing, Synced, Error). 

## Troubleshooting

- **Icon Overlays Missing**: Windows strictly limits the number of overlay icons system-wide to 15. If Dropbox, OneDrive, or similar software uses these up, the Shell extension registrar adds three spaces (`   AppJuragan`) to cheat the alphabetical sorting rank. Restart `explorer.exe` or sign out and in if they aren't appearing immediately.
- **Login OTP fails**: Make sure the backend (`cargo run`) is running locally on port 3000, and ensure your web front-end is logged in.
