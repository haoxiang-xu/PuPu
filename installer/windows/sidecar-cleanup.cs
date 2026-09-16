// Embedded by the signed NSIS installer; compatible with Windows PowerShell 5.1.
// A PID/name is only a discovery hint. Termination uses a pinned, verified handle.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace PuPu.Installer
{
    public static class SidecarCleanup
    {
        const uint Query = 0x1000, Synchronize = 0x100000, Terminate = 1;
        const uint Timeout = 258, Failed = 0xffffffff;
        const int MaximumProcesses = 256;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct Entry
        {
            public uint Size, Usage, Id;
            public UIntPtr Heap;
            public uint Module, Threads, Parent;
            public int Priority;
            public uint Flags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern SafeFileHandle CreateToolhelp32Snapshot(uint flags, uint id);
        [DllImport("kernel32.dll", EntryPoint = "Process32FirstW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool Process32First(SafeFileHandle snapshot, ref Entry entry);
        [DllImport("kernel32.dll", EntryPoint = "Process32NextW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool Process32Next(SafeFileHandle snapshot, ref Entry entry);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern SafeProcessHandle OpenProcess(uint access, bool inherit, uint id);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool QueryFullProcessImageName(SafeProcessHandle process, uint flags, StringBuilder path, ref uint size);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetProcessTimes(SafeProcessHandle process, out long birth, out long exit, out long kernel, out long user);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern uint WaitForSingleObject(SafeProcessHandle process, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool TerminateProcess(SafeProcessHandle process, uint exitCode);
        [DllImport("kernel32.dll", EntryPoint = "CreateFileW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern uint GetFinalPathNameByHandle(SafeFileHandle file, StringBuilder path, uint length, uint flags);

        sealed class Owned : IDisposable
        {
            public uint Id;
            public long Birth;
            public SafeProcessHandle Handle;
            public bool Alive
            {
                get
                {
                    uint result = WaitForSingleObject(Handle, 0);
                    if (result == Failed) throw NativeError("process wait failed");
                    return result == Timeout;
                }
            }
            public long ExitTime
            {
                get
                {
                    long birth, exit, kernel, user;
                    if (!GetProcessTimes(Handle, out birth, out exit, out kernel, out user))
                        throw NativeError("process identity unavailable");
                    return exit;
                }
            }
            public void Dispose() { Handle.Dispose(); }
        }

        static Exception NativeError(string description)
        {
            return new Win32Exception(Marshal.GetLastWin32Error(), description);
        }

        static List<Entry> Snapshot()
        {
            using (SafeFileHandle snapshot = CreateToolhelp32Snapshot(2, 0))
            {
                if (snapshot.IsInvalid) throw NativeError("process enumeration unavailable");
                var rows = new List<Entry>();
                var entry = new Entry { Size = (uint)Marshal.SizeOf(typeof(Entry)) };
                if (!Process32First(snapshot, ref entry)) throw NativeError("process enumeration failed");
                do { rows.Add(entry); } while (Process32Next(snapshot, ref entry));
                if (Marshal.GetLastWin32Error() != 18) throw NativeError("process enumeration incomplete");
                return rows;
            }
        }

        // Resolve 8.3 aliases and junctions through native handles, including the
        // existing ancestor of a not-yet-created fresh installation directory.
        static string CanonicalPath(string value)
        {
            string existing = Path.GetFullPath(value);
            var tail = new Stack<string>();
            while (!File.Exists(existing) && !Directory.Exists(existing))
            {
                string parent = Path.GetDirectoryName(existing);
                if (String.IsNullOrEmpty(parent)) throw new IOException("path ancestor unavailable");
                tail.Push(Path.GetFileName(existing));
                existing = parent;
            }
            using (SafeFileHandle handle = CreateFile(existing, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero))
            {
                if (handle.IsInvalid) throw NativeError("path identity unavailable");
                var text = new StringBuilder(32768);
                uint size = GetFinalPathNameByHandle(handle, text, (uint)text.Capacity, 0);
                if (size == 0 || size >= text.Capacity) throw NativeError("path identity incomplete");
                string result = text.ToString();
                if (result.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase))
                    result = @"\\" + result.Substring(8);
                else if (result.StartsWith(@"\\?\", StringComparison.Ordinal)) result = result.Substring(4);
                while (tail.Count > 0) result = Path.Combine(result, tail.Pop());
                return result.TrimEnd('\\');
            }
        }

        static bool Same(string left, string right)
        {
            return String.Equals(left, right, StringComparison.OrdinalIgnoreCase);
        }

        static string ValidateDirectory(string value)
        {
            if (String.IsNullOrWhiteSpace(value) || value.IndexOfAny(new[] { '\r', '\n', '\0', '"' }) >= 0)
                throw new ArgumentException("invalid installation directory");
            value = value.Replace('/', '\\');
            if (value.Length < 4 || !Char.IsLetter(value[0]) || value[1] != ':' || value[2] != '\\' || value.IndexOf(':', 2) >= 0)
                throw new ArgumentException("installation directory must be a local absolute path");
            string result = CanonicalPath(value);
            if (result.Length < 4 || result[1] != ':' || result.StartsWith(@"\\", StringComparison.Ordinal))
                throw new ArgumentException("drive roots and remote paths are not installation directories");
            var protectedPaths = new List<string> { Path.GetTempPath() };
            foreach (Environment.SpecialFolder folder in new[] {
                Environment.SpecialFolder.UserProfile, Environment.SpecialFolder.Windows,
                Environment.SpecialFolder.System, Environment.SpecialFolder.ProgramFiles,
                Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.CommonApplicationData,
                Environment.SpecialFolder.ApplicationData, Environment.SpecialFolder.LocalApplicationData,
                Environment.SpecialFolder.DesktopDirectory, Environment.SpecialFolder.MyDocuments })
                protectedPaths.Add(Environment.GetFolderPath(folder));
            // NSIS may launch 32-bit PowerShell. Known-folder ProgramFiles and
            // System then name the redirected roots, not their 64-bit peers.
            foreach (string name in new[] { "ProgramW6432", "CommonProgramW6432", "CommonProgramFiles", "CommonProgramFiles(x86)" })
                protectedPaths.Add(Environment.GetEnvironmentVariable(name));
            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            if (!String.IsNullOrEmpty(windows))
            {
                protectedPaths.Add(Path.Combine(windows, "System32"));
                protectedPaths.Add(Path.Combine(windows, "SysWOW64"));
                protectedPaths.Add(Path.Combine(windows, "Sysnative"));
            }
            foreach (string protectedPath in protectedPaths)
                if (!String.IsNullOrEmpty(protectedPath) && Same(result, CanonicalPath(protectedPath)))
                    throw new ArgumentException("protected directory is not an installation directory");
            return result;
        }

        static Owned Pin(uint id, bool mayTerminate)
        {
            if (id <= 1) throw new InvalidOperationException("protected process identity");
            SafeProcessHandle handle = OpenProcess(Query | Synchronize | (mayTerminate ? Terminate : 0), false, id);
            if (handle.IsInvalid)
            {
                int error = Marshal.GetLastWin32Error();
                handle.Dispose();
                if (error == 87) return null; // exited between snapshot and open
                throw new Win32Exception(error, "cannot inspect a possible owned process");
            }
            var result = new Owned { Id = id, Handle = handle };
            try
            {
                if (!result.Alive) { result.Dispose(); return null; }
                long birth, exit, kernel, user;
                if (!GetProcessTimes(handle, out birth, out exit, out kernel, out user))
                    throw NativeError("process creation identity unavailable");
                result.Birth = birth;
                return result;
            }
            catch { result.Dispose(); throw; }
        }

        static bool HasImage(Owned process, string expected)
        {
            var text = new StringBuilder(32768);
            uint size = (uint)text.Capacity;
            if (!QueryFullProcessImageName(process.Handle, 0, text, ref size))
            {
                if (!process.Alive) return false;
                throw NativeError("process executable identity unavailable");
            }
            return Same(CanonicalPath(text.ToString()), expected);
        }

        static HashSet<uint> ProtectedProcesses(List<Entry> rows)
        {
            var result = new HashSet<uint> { 0, 1 };
            uint id = (uint)Process.GetCurrentProcess().Id;
            while (result.Add(id))
            {
                Entry row = rows.Find(delegate(Entry item) { return item.Id == id; });
                if (row.Id != id || row.Parent == id) break;
                id = row.Parent;
            }
            return result;
        }

        static bool AppAlive(List<Entry> rows, string appPath)
        {
            foreach (Entry row in rows)
            {
                if (!Same(row.Name, "PuPu.exe")) continue;
                using (Owned process = Pin(row.Id, false))
                    if (process != null && HasImage(process, appPath) && process.Alive) return true;
            }
            return false;
        }

        static void AddOwned(Dictionary<uint, Owned> owned, HashSet<uint> protectedIds, Owned process)
        {
            if (protectedIds.Contains(process.Id) || owned.Count >= MaximumProcesses)
            {
                process.Dispose();
                throw new InvalidOperationException("unsafe or excessive process ownership scope");
            }
            owned.Add(process.Id, process);
        }

        public static int Run(string installDirectory)
        {
            string root = ValidateDirectory(installDirectory);
            string appPath = CanonicalPath(Path.Combine(root, "PuPu.exe"));
            string sidecarPath = CanonicalPath(Path.Combine(root, @"resources\unchain_runtime\dist\windows\unchain-server.exe"));
            var clock = Stopwatch.StartNew();
            // customInit precedes NSIS's generic running-app prompt. Never tear
            // down the backend of a still-running manual-install user's UI.
            while (AppAlive(Snapshot(), appPath))
            {
                if (clock.ElapsedMilliseconds >= 10000)
                    throw new InvalidOperationException("close PuPu before installing this update");
                Thread.Sleep(100);
            }

            var owned = new Dictionary<uint, Owned>();
            var terminated = new HashSet<uint>();
            int emptyPasses = 0;
            try
            {
                while (clock.ElapsedMilliseconds < 25000)
                {
                    List<Entry> rows = Snapshot();
                    HashSet<uint> protectedIds = ProtectedProcesses(rows);
                    if (AppAlive(rows, appPath)) throw new InvalidOperationException("PuPu restarted during installation preflight");
                    int added = 0;
                    foreach (Entry row in rows)
                    {
                        if (!Same(row.Name, "unchain-server.exe") || owned.ContainsKey(row.Id)) continue;
                        // Discovery of another installation never asks for
                        // termination rights. Escalate only after exact identity.
                        Owned observed = Pin(row.Id, false);
                        if (observed == null) continue;
                        bool matches;
                        try { matches = HasImage(observed, sidecarPath); }
                        catch { observed.Dispose(); throw; }
                        if (!matches) { observed.Dispose(); continue; }
                        Owned process;
                        try
                        {
                            process = Pin(row.Id, true);
                            if (process != null && process.Birth != observed.Birth)
                            {
                                process.Dispose();
                                throw new InvalidOperationException("process generation changed during preflight");
                            }
                        }
                        finally { observed.Dispose(); }
                        if (process == null) continue;
                        AddOwned(owned, protectedIds, process);
                        added++;
                    }

                    // Keep dead-parent handles until the whole operation ends.
                    // Creation/exit bounds prevent unrelated PID reuse from
                    // becoming ancestry; never sweep siblings of a dead parent.
                    bool expanded;
                    do
                    {
                        expanded = false;
                        foreach (Entry row in rows)
                        {
                            Owned parent;
                            if (owned.ContainsKey(row.Id) || !owned.TryGetValue(row.Parent, out parent)) continue;
                            Owned child = Pin(row.Id, true);
                            if (child == null) continue;
                            long exit = parent.ExitTime;
                            if (child.Birth < parent.Birth || (exit != 0 && child.Birth > exit))
                            { child.Dispose(); continue; }
                            AddOwned(owned, protectedIds, child);
                            added++;
                            expanded = true;
                        }
                    } while (expanded);

                    bool live = false;
                    foreach (Owned process in owned.Values)
                    {
                        if (!process.Alive) continue;
                        live = true;
                        if (!TerminateProcess(process.Handle, 0) && process.Alive)
                            throw NativeError("owned process termination failed");
                        terminated.Add(process.Id);
                    }
                    // A post-termination rescan catches children spawned after
                    // the first snapshot, before their parent actually exited.
                    emptyPasses = !live && added == 0 ? emptyPasses + 1 : 0;
                    if (emptyPasses >= 2) return terminated.Count;
                    Thread.Sleep(100);
                }
                throw new TimeoutException("owned process cleanup timed out; installation must not continue");
            }
            finally { foreach (Owned process in owned.Values) process.Dispose(); }
        }
    }
}
