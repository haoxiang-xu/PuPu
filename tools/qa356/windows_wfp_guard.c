/* QA-only, dynamic WFP connection policy. Never linked into the product.
 * The caller supplies exactly the executable images to bind to this policy,
 * a root executable that must be one of those images, and one command line.
 * The dynamic policy stays active until the controlled job is empty.
 */
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <initguid.h>
#include <fwpmu.h>
#include <rpc.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define MAX_IMAGES 3
#define MAX_FILTERS (MAX_IMAGES * 3)
#define DRAIN_GRACE_MS 5000

typedef struct {
    wchar_t *path;
    BYTE *app_id;
    UINT32 app_id_size;
} IMAGE_BINDING;

typedef struct {
    UINT32 image_index, role;
    UINT64 id, weight;
    BOOL is_v6, permit;
    UINT8 protocol;
    UINT32 remote_ipv4;
    UINT16 remote_port;
} FILTER_READBACK;

static DWORD add_filter(HANDLE engine, const GUID *sublayer, const GUID *layer,
                        FWP_BYTE_BLOB *app, BOOL permit, UINT64 *id) {
    FWPM_FILTER0 filter = {0};
    FWPM_FILTER_CONDITION0 conditions[4] = {0};
    UINT64 weight = permit ? 10 : 1;
    UINT8 protocol = IPPROTO_TCP;
    UINT32 loopback = 0x7f000001;
    UINT16 port = 15879;

    filter.displayData.name = permit ? L"QA356 TCP loopback permit" : L"QA356 executable outbound deny";
    filter.layerKey = *layer;
    filter.subLayerKey = *sublayer;
    filter.weight.type = FWP_UINT64;
    filter.weight.uint64 = &weight;
    filter.action.type = permit ? FWP_ACTION_PERMIT : FWP_ACTION_BLOCK;
    conditions[0].fieldKey = FWPM_CONDITION_ALE_APP_ID;
    conditions[0].matchType = FWP_MATCH_EQUAL;
    conditions[0].conditionValue.type = FWP_BYTE_BLOB_TYPE;
    conditions[0].conditionValue.byteBlob = app;
    filter.numFilterConditions = 1;
    if (permit) {
        conditions[1].fieldKey = FWPM_CONDITION_IP_PROTOCOL;
        conditions[1].matchType = FWP_MATCH_EQUAL;
        conditions[1].conditionValue.type = FWP_UINT8;
        conditions[1].conditionValue.uint8 = protocol;
        conditions[2].fieldKey = FWPM_CONDITION_IP_REMOTE_ADDRESS;
        conditions[2].matchType = FWP_MATCH_EQUAL;
        conditions[2].conditionValue.type = FWP_UINT32;
        conditions[2].conditionValue.uint32 = loopback;
        conditions[3].fieldKey = FWPM_CONDITION_IP_REMOTE_PORT;
        conditions[3].matchType = FWP_MATCH_EQUAL;
        conditions[3].conditionValue.type = FWP_UINT16;
        conditions[3].conditionValue.uint16 = port;
        filter.numFilterConditions = 4;
    }
    filter.filterCondition = conditions;
    return FwpmFilterAdd0(engine, &filter, NULL, id);
}

static wchar_t *full_path(const wchar_t *input) {
    DWORD needed = GetFullPathNameW(input, 0, NULL, NULL);
    if (!needed) return NULL;
    wchar_t *path = (wchar_t *)calloc((size_t)needed + 1, sizeof(wchar_t));
    if (!path) return NULL;
    if (!GetFullPathNameW(input, needed + 1, path, NULL)) {
        free(path);
        return NULL;
    }
    DWORD attributes = GetFileAttributesW(path);
    if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY)) {
        free(path);
        return NULL;
    }
    return path;
}

static void write_json_string(FILE *file, const wchar_t *value) {
    int bytes = WideCharToMultiByte(CP_UTF8, 0, value, -1, NULL, 0, NULL, NULL);
    char *utf8 = bytes > 0 ? (char *)malloc((size_t)bytes) : NULL;
    if (!utf8 || !WideCharToMultiByte(CP_UTF8, 0, value, -1, utf8, bytes, NULL, NULL)) {
        fputs("\"<path-encoding-error>\"", file);
        free(utf8);
        return;
    }
    fputc('"', file);
    for (const unsigned char *p = (const unsigned char *)utf8; *p; ++p) {
        if (*p == '"' || *p == '\\') { fputc('\\', file); fputc(*p, file); }
        else if (*p < 0x20) fprintf(file, "\\u%04x", *p);
        else fputc(*p, file);
    }
    fputc('"', file);
    free(utf8);
}

static void write_app_id_hex(FILE *file, const BYTE *bytes, UINT32 length) {
    fputc('"', file);
    for (UINT32 i = 0; i < length; ++i) fprintf(file, "%02x", bytes[i]);
    fputc('"', file);
}

static DWORD query_active_processes(HANDLE job, DWORD *active) {
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info = {0};
    if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation,
                                   &info, sizeof(info), NULL)) return GetLastError();
    *active = info.ActiveProcesses;
    return ERROR_SUCCESS;
}

static BOOL validate_filter_readback(const FWPM_FILTER0 *filter,
                                     const IMAGE_BINDING *image,
                                     UINT32 image_index, UINT32 role,
                                     const GUID *sublayer, UINT64 id,
                                     FILTER_READBACK *record) {
    BOOL app_found = FALSE, protocol_found = FALSE, address_found = FALSE, port_found = FALSE;
    BOOL permit = role == 0, is_v6 = role == 2;
    const GUID *layer = is_v6 ? &FWPM_LAYER_ALE_AUTH_CONNECT_V6 : &FWPM_LAYER_ALE_AUTH_CONNECT_V4;
    if (!IsEqualGUID(&filter->subLayerKey, sublayer) || !IsEqualGUID(&filter->layerKey, layer) ||
        filter->action.type != (permit ? FWP_ACTION_PERMIT : FWP_ACTION_BLOCK) ||
        filter->weight.type != FWP_UINT64 || !filter->weight.uint64 ||
        *filter->weight.uint64 != (permit ? 10 : 1) ||
        filter->numFilterConditions != (permit ? 4u : 1u)) return FALSE;
    memset(record, 0, sizeof(*record));
    record->image_index = image_index; record->role = role; record->id = id;
    record->weight = *filter->weight.uint64; record->is_v6 = is_v6; record->permit = permit;
    for (UINT32 i = 0; i < filter->numFilterConditions; ++i) {
        const FWPM_FILTER_CONDITION0 *condition = &filter->filterCondition[i];
        if (condition->matchType != FWP_MATCH_EQUAL) return FALSE;
        if (IsEqualGUID(&condition->fieldKey, &FWPM_CONDITION_ALE_APP_ID)) {
            FWP_BYTE_BLOB *blob = condition->conditionValue.byteBlob;
            if (app_found || condition->conditionValue.type != FWP_BYTE_BLOB_TYPE || !blob || !blob->data ||
                blob->size != image->app_id_size || memcmp(blob->data, image->app_id, blob->size)) return FALSE;
            app_found = TRUE;
        } else if (IsEqualGUID(&condition->fieldKey, &FWPM_CONDITION_IP_PROTOCOL)) {
            if (!permit || protocol_found || condition->conditionValue.type != FWP_UINT8 ||
                condition->conditionValue.uint8 != IPPROTO_TCP) return FALSE;
            protocol_found = TRUE; record->protocol = condition->conditionValue.uint8;
        } else if (IsEqualGUID(&condition->fieldKey, &FWPM_CONDITION_IP_REMOTE_ADDRESS)) {
            if (!permit || address_found || condition->conditionValue.type != FWP_UINT32 ||
                condition->conditionValue.uint32 != 0x7f000001) return FALSE;
            address_found = TRUE; record->remote_ipv4 = condition->conditionValue.uint32;
        } else if (IsEqualGUID(&condition->fieldKey, &FWPM_CONDITION_IP_REMOTE_PORT)) {
            if (!permit || port_found || condition->conditionValue.type != FWP_UINT16 ||
                condition->conditionValue.uint16 != 15879) return FALSE;
            port_found = TRUE; record->remote_port = condition->conditionValue.uint16;
        } else return FALSE;
    }
    return app_found && (!permit || (protocol_found && address_found && port_found));
}

static DWORD write_receipt(const wchar_t *receipt_path, DWORD setup_error,
                           DWORD cleanup_error, DWORD child_exit, DWORD pid,
                           const IMAGE_BINDING *images, UINT32 image_count,
                           const UINT64 *committed_ids, UINT32 committed_count,
                           BOOL policy_committed, BOOL job_assigned,
                           BOOL target_created, BOOL target_resumed,
                           DWORD active_before_terminate, BOOL terminate_called,
                           DWORD terminate_status, BOOL family_drained,
                           ULONGLONG committed_at, ULONGLONG resumed_at,
                           ULONGLONG root_exited_at, ULONGLONG terminate_at,
                           ULONGLONG drained_at, DWORD engine_close_status,
                           BOOL engine_close_called, BOOL unassigned_root_signaled,
                           const FILTER_READBACK *readbacks, UINT32 readback_count) {
    FILE *file = NULL;
    errno_t open_status = _wfopen_s(&file, receipt_path, L"w");
    if (open_status != 0 || !file) return open_status ? (DWORD)open_status : ERROR_OPEN_FAILED;
    fprintf(file, "{\"schema\":\"qa356.wfp-guard-receipt.v2\",\"complete\":true,\"setup_error\":%lu,\"cleanup_error\":%lu,"
        "\"child_exit\":%lu,\"child_pid\":%lu,\"program_count\":%u,"
        "\"policy_committed\":%s,\"job_assigned\":%s,\"target_created_suspended\":%s,\"target_resumed\":%s,"
        "\"committed_tick_ms\":%llu,\"resumed_tick_ms\":%llu,\"root_exited_tick_ms\":%llu,"
        "\"active_before_terminate\":%lu,\"terminate_called\":%s,\"terminate_status\":%lu,"
        "\"terminate_tick_ms\":%llu,\"family_drained\":%s,\"drained_tick_ms\":%llu,"
        "\"engine_close_called\":%s,\"engine_close_status\":%lu,\"unassigned_root_signaled\":%s,"
        "\"policy\":{\"permit\":{\"protocol\":\"TCP\",\"remote_ipv4\":\"127.0.0.1\",\"remote_port\":15879},"
        "\"deny\":[\"all-other-IPv4-connect\",\"all-IPv6-connect\"]},\"filter_ids\":[",
        setup_error, cleanup_error, child_exit, pid, image_count,
        policy_committed ? "true" : "false", job_assigned ? "true" : "false",
        target_created ? "true" : "false", target_resumed ? "true" : "false",
        committed_at, resumed_at, root_exited_at, active_before_terminate,
        terminate_called ? "true" : "false", terminate_status, terminate_at,
        family_drained ? "true" : "false", drained_at,
        engine_close_called ? "true" : "false", engine_close_status,
        unassigned_root_signaled ? "true" : "false");
    for (UINT32 i = 0; i < committed_count; ++i)
        fprintf(file, "%s%llu", i ? "," : "", committed_ids[i]);
    fputs("],\"filter_readbacks\":[", file);
    for (UINT32 i = 0; i < readback_count; ++i) {
        const FILTER_READBACK *r = &readbacks[i];
        if (i) fputc(',', file);
        fprintf(file, "{\"image_index\":%u,\"role\":\"%s\",\"id\":%llu,\"layer\":\"%s\","
            "\"action\":\"%s\",\"weight\":%llu,\"app_id_hex\":",
            r->image_index, r->role == 0 ? "permit" : (r->role == 1 ? "deny_v4" : "deny_v6"),
            r->id, r->is_v6 ? "ALE_AUTH_CONNECT_V6" : "ALE_AUTH_CONNECT_V4",
            r->permit ? "permit" : "block", r->weight);
        write_app_id_hex(file, images[r->image_index].app_id, images[r->image_index].app_id_size);
        if (r->permit) fprintf(file, ",\"protocol\":%u,\"remote_ipv4_host_order\":%u,\"remote_port\":%u",
                               r->protocol, r->remote_ipv4, r->remote_port);
        fputc('}', file);
    }
    fputs("],\"images\":[", file);
    for (UINT32 i = 0; i < image_count; ++i) {
        if (i) fputc(',', file);
        fputs("{\"path\":", file);
        write_json_string(file, images[i].path ? images[i].path : L"");
        fputs(",\"app_id_hex\":", file);
        write_app_id_hex(file, images[i].app_id, images[i].app_id_size);
        fputc('}', file);
    }
    fputs("]}\n", file);
    BOOL write_failed = ferror(file) != 0;
    if (fclose(file) != 0) write_failed = TRUE;
    return write_failed ? ERROR_WRITE_FAULT : ERROR_SUCCESS;
}

int wmain(int argc, wchar_t **argv) {
    HANDLE engine = NULL, job = NULL;
    FWPM_SESSION0 session = {0};
    FWPM_SUBLAYER0 sublayer = {0};
    PROCESS_INFORMATION process = {0};
    STARTUPINFOW startup = {0};
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {0};
    IMAGE_BINDING images[MAX_IMAGES] = {0};
    UINT64 pending_ids[MAX_FILTERS] = {0}, committed_ids[MAX_FILTERS] = {0};
    FILTER_READBACK readbacks[MAX_FILTERS] = {0};
    UINT32 image_count = 0, pending_count = 0, committed_count = 0;
    UINT32 readback_count = 0;
    DWORD setup_error = ERROR_SUCCESS, cleanup_error = ERROR_SUCCESS;
    DWORD child_exit = 125, active_before_terminate = 0, terminate_status = ERROR_SUCCESS;
    DWORD active = 0, close_status = ERROR_SUCCESS;
    ULONGLONG committed_at = 0, resumed_at = 0, root_exited_at = 0;
    ULONGLONG terminate_at = 0, drained_at = 0, drain_deadline = 0;
    BOOL transaction = FALSE, policy_committed = FALSE, job_assigned = FALSE;
    BOOL target_created = FALSE, target_resumed = FALSE, terminate_called = FALSE;
    BOOL family_drained = FALSE, engine_close_called = FALSE;
    BOOL unassigned_root_signaled = FALSE;
    BOOL hold_receipt_written = FALSE;
    wchar_t *root_image = NULL, *command = NULL;
    FWP_BYTE_BLOB *app = NULL;

    if (argc < 8 || _wtoi(argv[2]) != 3) {
        if (argc > 1) {
            FILE *invalid_file = NULL;
            errno_t invalid_open = _wfopen_s(&invalid_file, argv[1], L"w");
            if (invalid_open == 0 && invalid_file) {
                fputs("{\"schema\":\"qa356.wfp-guard-receipt.v2\",\"complete\":false,\"setup_error\":87}\n", invalid_file);
                BOOL failed = ferror(invalid_file) != 0;
                if (fclose(invalid_file) != 0) failed = TRUE;
                if (failed) return 125;
            }
        }
        return 125;
    }
    image_count = (UINT32)_wtoi(argv[2]);
    if (argc != (int)(image_count + 5)) {
        FILE *invalid_file = NULL;
        errno_t invalid_open = _wfopen_s(&invalid_file, argv[1], L"w");
        if (invalid_open == 0 && invalid_file) {
            fputs("{\"schema\":\"qa356.wfp-guard-receipt.v2\",\"complete\":false,\"setup_error\":87}\n", invalid_file);
            BOOL failed = ferror(invalid_file) != 0;
            if (fclose(invalid_file) != 0) failed = TRUE;
            if (failed) return 125;
        }
        return 125;
    }
#define CHECK_SETUP(call) do { setup_error = (DWORD)(call); if (setup_error != ERROR_SUCCESS) goto cleanup; } while (0)

    for (UINT32 i = 0; i < image_count; ++i) {
        images[i].path = full_path(argv[3 + i]);
        if (!images[i].path) { setup_error = ERROR_FILE_NOT_FOUND; goto cleanup; }
    }
    root_image = full_path(argv[3 + image_count]);
    if (!root_image) { setup_error = ERROR_FILE_NOT_FOUND; goto cleanup; }
    BOOL root_is_bound = FALSE;
    for (UINT32 i = 0; i < image_count; ++i)
        if (_wcsicmp(root_image, images[i].path) == 0) root_is_bound = TRUE;
    if (!root_is_bound) { setup_error = ERROR_INVALID_PARAMETER; goto cleanup; }

    session.displayData.name = L"QA356 temporary executable network guard";
    session.flags = FWPM_SESSION_FLAG_DYNAMIC;
    CHECK_SETUP(FwpmEngineOpen0(NULL, RPC_C_AUTHN_WINNT, NULL, &session, &engine));
    CHECK_SETUP(FwpmTransactionBegin0(engine, 0));
    transaction = TRUE;
    RPC_STATUS uuid_status = UuidCreate(&sublayer.subLayerKey);
    if (uuid_status != RPC_S_OK && uuid_status != RPC_S_UUID_LOCAL_ONLY) {
        setup_error = (DWORD)uuid_status; goto cleanup;
    }
    sublayer.displayData.name = L"QA356 temporary executable sublayer";
    sublayer.weight = 65535;
    CHECK_SETUP(FwpmSubLayerAdd0(engine, &sublayer, NULL));

    for (UINT32 i = 0; i < image_count; ++i) {
        CHECK_SETUP(FwpmGetAppIdFromFileName0(images[i].path, &app));
        if (!app || !app->data || !app->size) { setup_error = ERROR_INVALID_DATA; goto cleanup; }
        images[i].app_id = (BYTE *)malloc(app->size);
        if (!images[i].app_id) { setup_error = ERROR_NOT_ENOUGH_MEMORY; goto cleanup; }
        memcpy(images[i].app_id, app->data, app->size);
        images[i].app_id_size = app->size;
        CHECK_SETUP(add_filter(engine, &sublayer.subLayerKey, &FWPM_LAYER_ALE_AUTH_CONNECT_V4,
                              app, TRUE, &pending_ids[pending_count]));
        ++pending_count;
        CHECK_SETUP(add_filter(engine, &sublayer.subLayerKey, &FWPM_LAYER_ALE_AUTH_CONNECT_V4,
                              app, FALSE, &pending_ids[pending_count]));
        ++pending_count;
        CHECK_SETUP(add_filter(engine, &sublayer.subLayerKey, &FWPM_LAYER_ALE_AUTH_CONNECT_V6,
                              app, FALSE, &pending_ids[pending_count]));
        ++pending_count;
        FwpmFreeMemory0((void **)&app);
    }
    CHECK_SETUP(FwpmTransactionCommit0(engine));
    transaction = FALSE;
    policy_committed = TRUE;
    committed_at = GetTickCount64();
    memcpy(committed_ids, pending_ids, pending_count * sizeof(UINT64));
    committed_count = pending_count;
    for (UINT32 i = 0; i < image_count; ++i) {
        for (UINT32 role = 0; role < 3; ++role) {
            FWPM_FILTER0 *stored = NULL;
            UINT32 index = i * 3 + role;
            CHECK_SETUP(FwpmFilterGetById0(engine, committed_ids[index], &stored));
            BOOL valid = stored && validate_filter_readback(stored, &images[i], i, role,
                &sublayer.subLayerKey, committed_ids[index], &readbacks[index]);
            if (stored) FwpmFreeMemory0((void **)&stored);
            if (!valid) { setup_error = ERROR_INVALID_DATA; goto cleanup; }
            ++readback_count;
        }
    }

    job = CreateJobObjectW(NULL, NULL);
    if (!job) { setup_error = GetLastError(); goto cleanup; }
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
        setup_error = GetLastError(); goto cleanup;
    }
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
    startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    command = _wcsdup(argv[4 + image_count]);
    if (!command) { setup_error = ERROR_NOT_ENOUGH_MEMORY; goto cleanup; }
    if (!CreateProcessW(root_image, command, NULL, NULL, TRUE, CREATE_SUSPENDED,
                        NULL, NULL, &startup, &process)) {
        setup_error = GetLastError(); goto cleanup;
    }
    target_created = TRUE;
    if (!AssignProcessToJobObject(job, process.hProcess)) {
        setup_error = GetLastError(); goto cleanup;
    }
    job_assigned = TRUE;
    if (ResumeThread(process.hThread) == (DWORD)-1) {
        setup_error = GetLastError(); goto cleanup;
    }
    target_resumed = TRUE;
    resumed_at = GetTickCount64();
    if (WaitForSingleObject(process.hProcess, 300000) != WAIT_OBJECT_0) {
        setup_error = ERROR_TIMEOUT;
        goto cleanup;
    }
    if (!GetExitCodeProcess(process.hProcess, &child_exit)) {
        setup_error = GetLastError(); goto cleanup;
    }
    root_exited_at = GetTickCount64();

cleanup:
    if (transaction && engine) {
        DWORD abort_status = FwpmTransactionAbort0(engine);
        if (abort_status != ERROR_SUCCESS && cleanup_error == ERROR_SUCCESS) cleanup_error = abort_status;
        transaction = FALSE;
    }
    if (app) FwpmFreeMemory0((void **)&app);

    if (job) {
        if (process.hProcess && target_created && !job_assigned) {
            if (!TerminateProcess(process.hProcess, 125) && cleanup_error == ERROR_SUCCESS)
                cleanup_error = GetLastError();
            DWORD root_wait = WaitForSingleObject(process.hProcess, 5000);
            if (root_wait == WAIT_OBJECT_0) {
                unassigned_root_signaled = TRUE;
            } else if (cleanup_error == ERROR_SUCCESS) {
                cleanup_error = root_wait == WAIT_FAILED ? GetLastError() : ERROR_TIMEOUT;
            }
        } else if (process.hProcess && !target_resumed &&
                   !TerminateProcess(process.hProcess, 125) && cleanup_error == ERROR_SUCCESS) {
            cleanup_error = GetLastError();
        }
        DWORD query_status = query_active_processes(job, &active_before_terminate);
        if (query_status != ERROR_SUCCESS && cleanup_error == ERROR_SUCCESS) cleanup_error = query_status;
        if (query_status == ERROR_SUCCESS && active_before_terminate > 0) {
            terminate_called = TRUE;
            terminate_at = GetTickCount64();
            if (!TerminateJobObject(job, 125)) {
                terminate_status = GetLastError();
                if (cleanup_error == ERROR_SUCCESS) cleanup_error = terminate_status;
            }
        }
        drain_deadline = GetTickCount64() + DRAIN_GRACE_MS;
        for (;;) {
            query_status = query_active_processes(job, &active);
            if (query_status != ERROR_SUCCESS) {
                if (cleanup_error == ERROR_SUCCESS) cleanup_error = query_status;
            } else if (active == 0) {
                if (!target_created || job_assigned || unassigned_root_signaled) {
                    family_drained = TRUE;
                    drained_at = GetTickCount64();
                } else if (cleanup_error == ERROR_SUCCESS) {
                    cleanup_error = ERROR_TIMEOUT;
                }
                break;
            }
            if (GetTickCount64() > drain_deadline && cleanup_error == ERROR_SUCCESS)
                cleanup_error = ERROR_TIMEOUT;
            if (GetTickCount64() > drain_deadline && !hold_receipt_written) {
                DWORD hold_status = write_receipt(argv[1], setup_error, cleanup_error, child_exit,
                    process.dwProcessId, images, image_count, committed_ids, committed_count,
                    policy_committed, job_assigned, target_created, target_resumed,
                    active_before_terminate, terminate_called, terminate_status, FALSE,
                    committed_at, resumed_at, root_exited_at, terminate_at, 0,
                    ERROR_SUCCESS, FALSE, unassigned_root_signaled, readbacks, readback_count);
                if (hold_status != ERROR_SUCCESS && cleanup_error == ERROR_TIMEOUT)
                    cleanup_error = hold_status;
                hold_receipt_written = TRUE;
            }
            /* Keep the engine open while a known job member still exists. */
            Sleep(100);
        }
        if (process.hThread) { CloseHandle(process.hThread); process.hThread = NULL; }
        if (process.hProcess) { CloseHandle(process.hProcess); process.hProcess = NULL; }
        if (!CloseHandle(job) && cleanup_error == ERROR_SUCCESS) cleanup_error = GetLastError();
        job = NULL;
    } else {
        /* There is no job object to account for; a created root must be signaled. */
        if (process.hProcess) {
            DWORD wait_status = WaitForSingleObject(process.hProcess, 5000);
            if (wait_status == WAIT_OBJECT_0) {
                family_drained = TRUE;
                drained_at = GetTickCount64();
            } else if (cleanup_error == ERROR_SUCCESS) {
                cleanup_error = wait_status == WAIT_FAILED ? GetLastError() : ERROR_TIMEOUT;
            }
        } else {
            family_drained = TRUE;
            drained_at = GetTickCount64();
        }
    }

    if (engine && family_drained) {
        engine_close_called = TRUE;
        close_status = FwpmEngineClose0(engine);
        if (close_status != ERROR_SUCCESS && cleanup_error == ERROR_SUCCESS) cleanup_error = close_status;
        else if (close_status == ERROR_SUCCESS) engine = NULL;
    }

    DWORD receipt_status = write_receipt(argv[1], setup_error, cleanup_error, child_exit, process.dwProcessId,
        images, image_count, committed_ids, committed_count, policy_committed,
        job_assigned, target_created, target_resumed, active_before_terminate,
        terminate_called, terminate_status, family_drained, committed_at,
        resumed_at, root_exited_at, terminate_at, drained_at, close_status,
        engine_close_called, unassigned_root_signaled, readbacks, readback_count);
    if (receipt_status != ERROR_SUCCESS && cleanup_error == ERROR_SUCCESS)
        cleanup_error = receipt_status;

    /* A failed engine close must not silently turn a live guard into a pass. */
    if (engine) {
        for (;;) Sleep(1000);
    }
    for (UINT32 i = 0; i < image_count; ++i) {
        free(images[i].path);
        free(images[i].app_id);
    }
    free(root_image);
    free(command);
    if (setup_error != ERROR_SUCCESS || cleanup_error != ERROR_SUCCESS ||
        child_exit != 0 || !policy_committed || !job_assigned || !target_resumed ||
        !family_drained || !engine_close_called || close_status != ERROR_SUCCESS)
        return 125;
    return 0;
}
