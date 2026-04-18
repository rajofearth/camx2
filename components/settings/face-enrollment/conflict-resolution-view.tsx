import Image from "next/image";

export function ConflictResolutionView() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex items-end justify-between border-b border-op-border pb-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            CONFLICT_RESOLUTION_REQUIRED
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase text-op-text-sec">
            ENTITY_ID: PX-9920-ALPHA // STATUS: PENDING_OVERRIDE
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="border border-op-border bg-op-elevated px-4 py-2 text-xs font-semibold uppercase text-foreground transition-colors hover:bg-[#2A2A2A]"
          >
            Discard Batch
          </button>
          <button
            type="button"
            className="bg-op-silver px-4 py-2 text-xs font-bold uppercase text-op-base transition-colors hover:bg-white"
          >
            Resolve All Conflicts
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LOCAL_DB_ACTIVE */}
        <div className="flex flex-col rounded-sm border border-op-border bg-op-surface">
          <div className="flex items-center justify-between border-b border-op-border bg-op-elevated p-3">
            <span className="font-mono text-xs font-medium text-op-silver">
              SOURCE: LOCAL_DB_ACTIVE
            </span>
            <span className="font-mono text-[10px] text-op-text-sec">
              LAST_MODIFIED: 2023-10-12 14:22:01
            </span>
          </div>
          <div className="flex gap-4 p-4">
            <div className="relative h-40 w-32 shrink-0 overflow-hidden border border-op-border bg-op-base">
              <Image
                alt="Local database subject portrait"
                className="object-cover opacity-80 grayscale"
                fill
                sizes="128px"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuB3jaF37n86MyzWotZlcJVxf9Mhbth-m3RnK-AoxNPTnvhc8Up5qiSEIzdG6tV-GLgKyTEMRF9XFRQWoLRHNdDKBitSEDOb8hLk051WRaJuHtVzfrNMNvStDt8eskAd8Zy-GVtFlYz1R5Oj3EEyLcIzA9Y3lcJVhfsIuDxEI935fSkud6Uf5ZsAE_rvqr6sUA2ODdPZqmVhW6aWxP24rokY6yeguk2eWjRBB2ld-nxFsG3X-fLAkewvNKkrpI1LAYm66X-ltUSrYqQ7"
              />
              <div className="absolute bottom-0 left-0 w-full bg-op-elevated/80 p-1">
                <div className="confidence-gauge">
                  <div className="confidence-fill" style={{ width: "94%" }} />
                </div>
                <span className="font-mono text-[8px] text-op-silver">
                  MATCH: 94.2%
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <span className="block font-mono text-[10px] uppercase text-op-text-sec">
                    Full Name
                  </span>
                  <p className="font-mono text-sm text-foreground">
                    ELIAS VANCE
                  </p>
                </div>
                <div>
                  <span className="block font-mono text-[10px] uppercase text-op-text-sec">
                    Aliases
                  </span>
                  <p className="font-mono text-sm text-foreground">
                    &quot;GHOST&quot;, &quot;EV-9&quot;
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block font-mono text-[10px] uppercase text-op-text-sec">
                      DOB
                    </span>
                    <p className="font-mono text-sm text-foreground">
                      1984-05-19
                    </p>
                  </div>
                  <div>
                    <span className="block font-mono text-[10px] uppercase text-op-text-sec">
                      Gender
                    </span>
                    <p className="font-mono text-sm text-foreground">MALE</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-4 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="mb-1 block border-b border-op-border font-mono text-[10px] uppercase text-op-text-sec">
                  Height / Weight
                </span>
                <p className="font-mono text-sm text-foreground">
                  188cm / 92kg
                </p>
              </div>
              <div>
                <span className="mb-1 block border-b border-op-border font-mono text-[10px] uppercase text-op-text-sec">
                  Watchlist Level
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-op-critical" />
                  <p className="font-mono text-sm font-bold text-op-critical">
                    LEVEL_4_RESTRICTED
                  </p>
                </div>
              </div>
            </div>
            <div>
              <span className="mb-1 block border-b border-op-border font-mono text-[10px] uppercase text-op-text-sec">
                Distinguishing Features
              </span>
              <p className="font-mono text-xs leading-relaxed text-foreground">
                SCAR ON LEFT BROW, TRIBAL TATTOO ON RIGHT FOREARM. SLIGHT LIMP
                IN GAIT DETECTED BY ANALYTICS.
              </p>
            </div>
            <div>
              <span className="mb-1 block border-b border-op-border font-mono text-[10px] uppercase text-op-text-sec">
                Crime Categories
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="border border-op-critical px-2 py-0.5 font-mono text-[9px] text-white">
                  ESPIONAGE
                </span>
                <span className="border border-op-critical px-2 py-0.5 font-mono text-[9px] text-white">
                  DATA_THEFT
                </span>
              </div>
            </div>
          </div>
          <div className="mt-auto border-t border-op-border bg-op-elevated/50 p-4">
            <button
              type="button"
              className="w-full border border-op-silver bg-transparent py-3 font-mono text-xs font-bold text-op-silver transition-all hover:bg-op-silver hover:text-op-base"
            >
              KEEP LOCAL RECORD
            </button>
          </div>
        </div>

        {/* BATCH_IMPORT_STREAM */}
        <div className="relative flex flex-col rounded-sm border border-[#2E2E2E] bg-op-surface">
          <div className="absolute -right-2 -top-2 z-10 bg-op-critical px-2 py-1 font-mono text-[8px] text-white">
            CONFLICT_DETECTED
          </div>
          <div className="flex items-center justify-between border-b border-[#2E2E2E] bg-op-elevated p-3">
            <span className="font-mono text-xs font-medium text-foreground">
              SOURCE: BATCH_IMPORT_STREAM
            </span>
            <span className="font-mono text-[10px] text-op-text-sec">
              INGESTION_TIME: 2023-11-20 08:00:44
            </span>
          </div>
          <div className="flex gap-4 p-4">
            <div className="relative h-40 w-32 shrink-0 overflow-hidden border border-op-critical bg-op-base">
              <Image
                alt="Batch import subject portrait"
                className="object-cover grayscale"
                fill
                sizes="128px"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCsZUQodaArvA7B1slTw5WEJlS5zq74gkUZ4XDf7seqS9TRK3Mg4TooGGl1F6hs3JKcQdiQwCFp2lXZasi34WFQ_QsVmkX261mxzZ-9eLXK8CHe7-9--Ft5jPZVMeavKpWA_7h22IT-twkNUJwhWzz4eWV_98kwgtSyQEltjg9mSuiRdy_b2JKLvi5WJlq1oIeI3M8FlG-fjwZpOZAbxDHO86XL8OVfeKPc1TT--rhMvwG3q0VV33IS_YGnOFwwaglN2WVxP15tuiCy"
              />
              <div className="absolute bottom-0 left-0 w-full bg-op-critical/90 p-1">
                <span className="font-mono text-[8px] font-bold uppercase text-white">
                  Update Available
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <div className="group relative">
                  <span className="block font-mono text-[10px] uppercase text-op-text-sec">
                    Full Name
                  </span>
                  <p className="bg-op-elevated px-1 font-mono text-sm text-foreground">
                    ELIAS J. VANCE
                  </p>
                  <button
                    type="button"
                    className="absolute right-0 top-0 font-mono text-[10px] text-op-silver underline opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    USE THIS
                  </button>
                </div>
                <div className="group relative">
                  <span className="block font-mono text-[10px] uppercase text-op-text-sec">
                    Aliases
                  </span>
                  <p className="bg-op-elevated px-1 font-mono text-sm text-foreground">
                    &quot;GHOST&quot;, &quot;OPERATIVE_9&quot;, &quot;V&quot;
                  </p>
                  <button
                    type="button"
                    className="absolute right-0 top-0 font-mono text-[10px] text-op-silver underline opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    USE THIS
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block font-mono text-[10px] uppercase text-op-text-sec">
                      DOB
                    </span>
                    <p className="font-mono text-sm text-foreground">
                      1984-05-19{" "}
                      <span className="text-op-text-muted">(MATCH)</span>
                    </p>
                  </div>
                  <div className="group relative">
                    <span className="block font-mono text-[10px] uppercase text-op-text-sec">
                      Gender
                    </span>
                    <p className="bg-op-elevated px-1 font-mono text-sm text-foreground">
                      MALE <span className="text-op-text-muted">(MATCH)</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-4 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="group relative">
                <span className="mb-1 block border-b border-op-border font-mono text-[10px] uppercase text-op-text-sec">
                  Height / Weight
                </span>
                <p className="bg-op-elevated px-1 font-mono text-sm text-foreground">
                  189cm / 94kg{" "}
                  <span className="font-bold text-op-critical">(!)</span>
                </p>
                <button
                  type="button"
                  className="absolute right-0 top-0 font-mono text-[10px] text-op-silver underline opacity-0 transition-opacity group-hover:opacity-100"
                >
                  USE THIS
                </button>
              </div>
              <div className="group relative">
                <span className="mb-1 block border-b border-op-border font-mono text-[10px] uppercase text-op-text-sec">
                  Watchlist Level
                </span>
                <div className="flex items-center gap-2 bg-op-elevated px-1">
                  <div className="h-2 w-2 rounded-full bg-op-critical" />
                  <p className="font-mono text-sm font-bold text-op-critical">
                    LEVEL_5_CRITICAL
                  </p>
                </div>
                <button
                  type="button"
                  className="absolute right-0 top-0 font-mono text-[10px] text-op-silver underline opacity-0 transition-opacity group-hover:opacity-100"
                >
                  USE THIS
                </button>
              </div>
            </div>
            <div className="group relative">
              <span className="mb-1 block border-b border-op-border font-mono text-[10px] uppercase text-op-text-sec">
                Distinguishing Features
              </span>
              <p className="bg-op-elevated px-1 font-mono text-xs leading-relaxed text-foreground">
                SCAR ON LEFT BROW, TRIBAL TATTOO ON RIGHT FOREARM. CERAMIC
                IMPLANT DETECTED IN LEFT ORBITAL BONE.
              </p>
              <button
                type="button"
                className="absolute right-0 top-0 font-mono text-[10px] text-op-silver underline opacity-0 transition-opacity group-hover:opacity-100"
              >
                USE THIS
              </button>
            </div>
            <div className="group relative">
              <span className="mb-1 block border-b border-op-border font-mono text-[10px] uppercase text-op-text-sec">
                Crime Categories
              </span>
              <div className="mt-1 flex flex-wrap gap-1 bg-op-elevated p-1">
                <span className="border border-op-critical px-2 py-0.5 font-mono text-[9px] text-white">
                  ESPIONAGE
                </span>
                <span className="border border-op-critical px-2 py-0.5 font-mono text-[9px] text-white">
                  DATA_THEFT
                </span>
                <span className="border border-op-critical px-2 py-0.5 font-mono text-[9px] text-white">
                  ASSET_LIQUIDATION
                </span>
              </div>
              <button
                type="button"
                className="absolute right-0 top-0 font-mono text-[10px] text-op-silver underline opacity-0 transition-opacity group-hover:opacity-100"
              >
                USE THIS
              </button>
            </div>
          </div>
          <div className="mt-auto border-t border-[#2E2E2E] bg-op-elevated p-4">
            <button
              type="button"
              className="w-full bg-op-silver py-3 font-mono text-xs font-extrabold uppercase text-op-base transition-all hover:bg-white"
            >
              UPDATE FROM SOURCE
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border border-op-border bg-op-surface p-3">
        <div className="flex gap-6">
          <div>
            <span className="block font-mono text-[9px] text-op-text-sec">
              RESOLUTION_METHOD
            </span>
            <span className="font-mono text-[10px] text-op-silver">
              MANUAL_OPERATOR_OVERRIDE
            </span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-op-text-sec">
              OPERATOR_ID
            </span>
            <span className="font-mono text-[10px] text-op-silver">
              SEC_OP_442
            </span>
          </div>
          <div>
            <span className="block font-mono text-[9px] text-op-text-sec">
              TERMINAL
            </span>
            <span className="font-mono text-[10px] text-op-silver">
              TX-NORTH-04
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-xs text-op-text-sec">
            verified_user
          </span>
          <span className="font-mono text-[10px] text-op-text-sec">
            SYSTEM_INTEGRITY_CHECK: PASS
          </span>
        </div>
      </div>
    </div>
  );
}
