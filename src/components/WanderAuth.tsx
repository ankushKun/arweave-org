import { useEffect, useRef } from "react";
import { WanderConnect } from "@wanderapp/connect";

export default function WanderAuth() {
  const wanderRef = useRef<any>(null);

  useEffect(() => {
    const wander = new (WanderConnect as any)({
      clientId: "FREE_TRIAL",
      ui: { launcher: false },
      showLauncher: false,
      button: false,
    });
    wanderRef.current = wander;

    // Expose opener on window for imperative usage
    (window as any).__wanderOpen = () => {
      try {
        if (typeof wander.open === "function") {
          wander.open();
        } else if (typeof wander.connect === "function") {
          wander.connect();
        }
      } catch {}
    };

    const handleWalletLoaded = () => {};
    window.addEventListener("arweaveWalletLoaded", handleWalletLoaded);

    // Full connect+permission+upload pipeline exposed for Astro to call
    (window as any).__wanderConnectAndUpload = async () => {
      const statusEl = document.getElementById(
        "status-el"
      ) as HTMLElement | null;
      const spinnerEl = document.getElementById(
        "upload-spinner"
      ) as HTMLElement | null;
      const checkEl = document.getElementById(
        "uploaded-check"
      ) as HTMLElement | null;
      try {
        console.log("[Wander] flow start");
        if (statusEl) statusEl.textContent = "Connecting...";
        spinnerEl?.classList.remove("hidden");
        checkEl?.classList.add("hidden");

        // Open auth UI and wait for wallet API
        (window as any).__wanderOpen?.();
        await new Promise((resolve, reject) => {
          if ((window as any).arweaveWallet) return resolve(null);
          const handler = () => {
            window.removeEventListener("arweaveWalletLoaded", handler as any);
            resolve(null);
          };
          window.addEventListener("arweaveWalletLoaded", handler as any, {
            once: true,
          });
          setTimeout(() => {
            window.removeEventListener("arweaveWalletLoaded", handler as any);
            reject(new Error("Timeout waiting for wallet"));
          }, 30000);
        });

        // Ensure an active address exists before requesting permissions
        const waitForActiveAddress = async (timeoutMs = 90000) =>
          new Promise<string>((resolve, reject) => {
            const start = Date.now();
            const tick = async () => {
              try {
                const addr = await (
                  window as any
                ).arweaveWallet?.getActiveAddress?.();
                if (addr && typeof addr === "string") return resolve(addr);
              } catch {
                // ignore
              }
              if (Date.now() - start > timeoutMs) {
                return reject(
                  new Error("Wallet is initializing. Please try again shortly.")
                );
              }
              setTimeout(tick, 750);
            };
            tick();
          });

        if (statusEl) statusEl.textContent = "Setting up wallet...";
        await waitForActiveAddress();

        // Request permissions per docs
        try {
          console.log("requesting permissions...");
          const required = [
            "ACCESS_ADDRESS",
            "ACCESS_PUBLIC_KEY",
            "SIGN_TRANSACTION",
            "DISPATCH",
          ];
          const existing =
            (await (window as any).arweaveWallet.getPermissions?.()) || [];
          const need = required.filter((p: string) => !existing.includes(p));
          if (need.length > 0) {
            await (window as any).arweaveWallet.connect(need as any, {
              name: "Arweave.org Uploader",
            });
          } else {
          }
          console.log("[Wander] perms ok");
        } catch (permErr) {
          console.error("[Wander] perm error", permErr);
          throw permErr;
        }

        // Close modal early so user returns to page
        // Try to close the Wander widget/panel as well
        try {
          wanderRef.current?.close?.();
        } catch {}
        const earlyModal = document.getElementById("wallet-modal");
        if (earlyModal) {
          earlyModal.classList.remove("flex");
          earlyModal.classList.add("hidden");
        }

        const file: File | undefined = (window as any).__selectedFile;
        if (!file) throw new Error("No file selected");

        const { default: Arweave } = await import("arweave");
        const arweave = Arweave.init({});
        const data = new Uint8Array(await file.arrayBuffer());
        let tx = await arweave.createTransaction({ data });
        if (file.type) {
          tx.addTag("Content-Type", file.type);
        }
        try {
          if ((arweave as any).transactions?.sign) {
            await (arweave as any).transactions.sign(tx);
          } else if ((window as any).arweaveWallet?.sign) {
            await (window as any).arweaveWallet.sign(tx);
          } else {
            throw new Error("No signing method available");
          }
        } catch (signErr) {
          console.error("[Wander] sign error", signErr);
          throw signErr;
        }

        // Some wallets may not populate tx.id; derive from signature if needed
        try {
          if (!tx.id && (tx as any).signature) {
            const sigB = arweave.utils.b64UrlToBuffer((tx as any).signature);
            const hash = await arweave.crypto.hash(sigB);
            const derivedId = arweave.utils.bufferTob64Url(hash);
            (tx as any).id = derivedId;
          }
        } catch (deriveErr) {
          // ignore
        }

        const isSigned =
          Boolean((tx as any).signature) &&
          typeof tx.id === "string" &&
          tx.id.length > 0;
        if (!isSigned) {
          throw new Error("Transaction is not signed");
        }

        // Prefer wallet.dispatch for sponsored FREE_TRIAL flows
        let dispatched = false;
        try {
          if ((window as any).arweaveWallet?.dispatch) {
            if (statusEl) statusEl.textContent = "Dispatching...";
            const res = await (window as any).arweaveWallet.dispatch(tx);
            if (res && res.id) {
              (tx as any).id = res.id;
              dispatched = true;
            }
          }
        } catch (dErr) {
          // ignore
        }

        if (!dispatched) {
          if (statusEl) statusEl.textContent = "Uploading...";
          // Try chunked uploader then fallback
          try {
            let uploader = await arweave.transactions.getUploader(tx);
            while (!uploader.isComplete) {
              await uploader.uploadChunk();
              const pct = Math.round(uploader.pctComplete * 100) / 100;
              if (statusEl) statusEl.textContent = `Uploading... ${pct}%`;
            }
          } catch (err) {
            const res = await arweave.transactions.post(tx);
            if (!res?.status || res.status < 200 || res.status >= 300) {
              throw new Error("POST upload failed");
            }
          }
        }

        const txId = tx.id;
        const linkEl = document.getElementById("view-link");
        const addrEl = document.getElementById("address-el");
        linkEl?.setAttribute("href", `https://arweave.net/${txId}`);
        if (addrEl) addrEl.textContent = txId;
        if (statusEl) statusEl.textContent = "File Uploaded";
        spinnerEl?.classList.add("hidden");
        checkEl?.classList.remove("hidden");

        // notify page that tx succeeded so it can enable Step 2
        try {
          (window as any).__onTxSuccess?.();
        } catch {}

        // Close modal
        const modal = document.getElementById("wallet-modal");
        if (modal) {
          modal.classList.remove("flex");
          modal.classList.add("hidden");
        }
        try {
          // Ensure widget is closed at the end too
          wanderRef.current?.close?.();
        } catch {}
        console.log("[Wander] uploaded", txId);
      } catch (e: any) {
        console.error("[Wander] failed", e);
        if (statusEl) statusEl.textContent = e?.message || "Upload failed";
        spinnerEl?.classList.add("hidden");
        checkEl?.classList.add("hidden");
      }
    };

    return () => {
      try {
        wander?.destroy?.();
      } catch {}
      wanderRef.current = null;
      delete (window as any).__wanderOpen;
      delete (window as any).__wanderConnectAndUpload;
      window.removeEventListener("arweaveWalletLoaded", handleWalletLoaded);
    };
  }, []);

  return null;
}
