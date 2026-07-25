export const ATTACHMENT_COMPOSER_RESOURCE_URI = "ui://shipmail/attachment-composer-v1.html";

export const ATTACHMENT_COMPOSER_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ShipMail attachment</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; padding: 16px; background: transparent; color: CanvasText; }
    main { border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 14px; padding: 16px; }
    h1 { font-size: 16px; margin: 0 0 12px; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 12px; margin: 0 0 16px; font-size: 13px; }
    dt { color: color-mix(in srgb, CanvasText 62%, transparent); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button { border: 0; border-radius: 9px; padding: 9px 13px; font: inherit; cursor: pointer; }
    button.primary { background: #0f766e; color: white; }
    button.secondary { background: color-mix(in srgb, CanvasText 10%, transparent); color: CanvasText; }
    button:disabled { cursor: wait; opacity: .58; }
    #status { min-height: 20px; margin: 12px 0 0; font-size: 13px; }
    #status.error { color: #dc2626; }
    #status.success { color: #15803d; }
  </style>
</head>
<body>
  <main>
    <h1>Review attachment send</h1>
    <dl>
      <dt>File</dt><dd id="file"></dd>
      <dt>To</dt><dd id="to"></dd>
      <dt>Subject</dt><dd id="subject"></dd>
      <dt>Delivery</dt><dd id="delivery"></dd>
    </dl>
    <div class="actions">
      <button id="submit" class="primary" type="button">Upload and send</button>
      <button id="change" class="secondary" type="button" hidden>Choose another file</button>
    </div>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
  <script>
    (function () {
      var bridge = window.openai;
      var input = bridge && bridge.toolInput ? bridge.toolInput : {};
      var selectedFile = input.file || null;
      var submit = document.getElementById("submit");
      var change = document.getElementById("change");
      var status = document.getElementById("status");

      function text(id, value) {
        document.getElementById(id).textContent = value || "Not provided";
      }
      function fileName(file) {
        return file && (file.file_name || file.fileName) ? (file.file_name || file.fileName) : "Selected file";
      }
      function recipients(values) {
        return (values || []).map(function (value) {
          return typeof value === "string" ? value : value.address;
        }).join(", ");
      }
      function setStatus(message, kind) {
        status.textContent = message;
        status.className = kind || "";
      }
      function setBusy(busy) {
        submit.disabled = busy;
        change.disabled = busy;
      }
      function readUrl(value) {
        if (typeof value === "string") return value;
        if (!value || typeof value !== "object") return null;
        return value.download_url || value.downloadUrl || value.url || null;
      }
      function readUploadUrl(result) {
        var direct = result && result._meta;
        var nested = result && result.mcp_tool_result && result.mcp_tool_result._meta;
        var metadata = result && result.toolResponseMetadata;
        return (direct && direct.upload_url) ||
          (nested && nested.upload_url) ||
          (metadata && metadata.upload_url) ||
          null;
      }
      function hasToolError(result) {
        return Boolean(result && (result.isError || result.is_error));
      }
      function bytesToHex(buffer) {
        return Array.from(new Uint8Array(buffer)).map(function (byte) {
          return byte.toString(16).padStart(2, "0");
        }).join("");
      }

      text("file", fileName(selectedFile));
      text("to", recipients(input.to));
      text("subject", input.subject);
      text("delivery", input.scheduled_at ? new Date(input.scheduled_at).toLocaleString() : "Send now");
      submit.textContent = input.scheduled_at ? "Upload and schedule" : "Upload and send";

      if (bridge && typeof bridge.selectFiles === "function") {
        change.hidden = false;
        change.addEventListener("click", async function () {
          try {
            var files = await bridge.selectFiles();
            if (files && files[0]) {
              selectedFile = files[0];
              text("file", fileName(selectedFile));
              setStatus("");
            }
          } catch (error) {
            setStatus("Could not open the file picker.", "error");
          }
        });
      }

      submit.addEventListener("click", async function () {
        if (!bridge || typeof bridge.callTool !== "function" ||
            typeof bridge.getFileDownloadUrl !== "function") {
          setStatus("This host does not support secure file handoff.", "error");
          return;
        }
        if (!selectedFile || !(selectedFile.file_id || selectedFile.fileId)) {
          setStatus("Choose a file first.", "error");
          return;
        }

        setBusy(true);
        try {
          setStatus("Downloading the selected file...");
          var fileId = selectedFile.file_id || selectedFile.fileId;
          var freshUrl = await bridge.getFileDownloadUrl({ fileId: fileId });
          var downloadUrl = readUrl(freshUrl) || selectedFile.download_url;
          if (!downloadUrl) throw new Error("download_url_missing");
          var fileResponse = await fetch(downloadUrl, {
            method: "GET",
            credentials: "omit",
            redirect: "error"
          });
          if (!fileResponse.ok) throw new Error("download_failed");
          var bytes = await fileResponse.arrayBuffer();
          if (bytes.byteLength < 1 || bytes.byteLength > 25 * 1024 * 1024) {
            throw new Error("file_size_invalid");
          }
          var digest = bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
          var contentType = selectedFile.mime_type || selectedFile.mimeType ||
            fileResponse.headers.get("content-type") || "application/octet-stream";
          var filename = fileName(selectedFile);

          setStatus("Preparing a one-time ShipMail upload...");
          var prepared = await bridge.callTool("shipmail_prepare_staged_attachment_upload", {
            mailbox_id: input.mailbox_id,
            filename: filename,
            content_type: contentType,
            size: bytes.byteLength,
            sha256: digest
          });
          if (hasToolError(prepared)) throw new Error("prepare_failed");
          var uploadUrl = readUploadUrl(prepared);
          if (!uploadUrl) throw new Error("upload_url_missing");

          setStatus("Uploading the attachment...");
          var upload = await fetch(uploadUrl, {
            method: "POST",
            body: bytes,
            credentials: "omit",
            redirect: "error",
            headers: { "Content-Type": contentType }
          });
          if (!upload.ok) throw new Error("upload_failed");
          var staged = await upload.json();
          if (!staged || !staged.id) throw new Error("staged_id_missing");

          setStatus(input.scheduled_at ? "Scheduling the message..." : "Sending the message...");
          var sendInput = Object.assign({}, input, {
            staged_attachment_ids: [staged.id],
            idempotency_key: "mcp_app_" + crypto.randomUUID().replace(/-/g, "")
          });
          delete sendInput.file;
          var sent = await bridge.callTool("shipmail_send_message", sendInput);
          if (hasToolError(sent)) throw new Error("send_failed");
          setStatus(input.scheduled_at ? "Message scheduled." : "Message sent.", "success");
          submit.hidden = true;
          change.hidden = true;
        } catch (error) {
          setStatus("The attachment could not be sent. No automatic retry was made.", "error");
        } finally {
          setBusy(false);
        }
      });
    })();
  </script>
</body>
</html>`;
