import React, { useState, useEffect, useRef, useCallback } from "react";
import { BookMarked, Plus, RefreshCw, GitCommit, X, ChevronRight, AlertCircle, Clock, Hash, User, Loader2 } from "lucide-react";

// ---------- helpers ----------

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function formatFullDate(dateStr) {
  return new Date(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseRepoInput(input) {
  // accepts "owner/repo" or a full github URL
  const trimmed = input.trim().replace(/\/$/, "");
  let match = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  match = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (match) return { owner: match[1], repo: match[2] };
  return null;
}

// ---------- main component ----------

export default function App() {
  const [repos, setRepos] = useState([]); // {id, owner, repo, commits, lastChecked, error, loading, seenShas}
  const [selectedId, setSelectedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [newlyStamped, setNewlyStamped] = useState({}); // sha -> true, for stamp animation
  const pollRef = useRef(null);

  const selected = repos.find((r) => r.id === selectedId) || null;

  // ---- fetching ----
  const fetchCommits = useCallback(async (owner, repo) => {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (res.status === 404) throw new Error("Repository not found. Check the owner and name.");
    if (res.status === 403) throw new Error("Rate limited by GitHub's public API. Wait a moment and retry.");
    if (!res.ok) throw new Error(`GitHub responded with ${res.status}.`);
    const data = await res.json();
    return data.map((c) => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      author: c.commit.author?.name || c.author?.login || "Unknown",
      authorAvatar: c.author?.avatar_url || null,
      date: c.commit.author?.date,
      url: c.html_url,
    }));
  }, []);

  const addRepo = useCallback(async () => {
    setAddError("");
    const parsed = parseRepoInput(addInput);
    if (!parsed) {
      setAddError("Enter as owner/repo or a full GitHub URL.");
      return;
    }
    if (repos.some((r) => r.owner.toLowerCase() === parsed.owner.toLowerCase() && r.repo.toLowerCase() === parsed.repo.toLowerCase())) {
      setAddError("That repository is already in the ledger.");
      return;
    }
    setAddLoading(true);
    try {
      const commits = await fetchCommits(parsed.owner, parsed.repo);
      const id = `${parsed.owner}/${parsed.repo}`;
      setRepos((prev) => [
        ...prev,
        {
          id,
          owner: parsed.owner,
          repo: parsed.repo,
          commits,
          seenShas: new Set(commits.map((c) => c.sha)),
          lastChecked: new Date().toISOString(),
          error: null,
        },
      ]);
      setSelectedId(id);
      setShowAddModal(false);
      setAddInput("");
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
  }, [addInput, repos, fetchCommits]);

  const checkRepo = useCallback(
    async (id, { silent = false } = {}) => {
      setRepos((prev) => prev.map((r) => (r.id === id ? { ...r, checking: true } : r)));
      const target = repos.find((r) => r.id === id);
      if (!target) return;
      try {
        const commits = await fetchCommits(target.owner, target.repo);
        setRepos((prev) =>
          prev.map((r) => {
            if (r.id !== id) return r;
            const newOnes = commits.filter((c) => !r.seenShas.has(c.sha));
            if (newOnes.length > 0) {
              const stampUpdates = {};
              newOnes.forEach((c) => (stampUpdates[c.sha] = true));
              setNewlyStamped((prevS) => ({ ...prevS, ...stampUpdates }));
              setTimeout(() => {
                setNewlyStamped((prevS) => {
                  const next = { ...prevS };
                  newOnes.forEach((c) => delete next[c.sha]);
                  return next;
                });
              }, 2200);
            }
            return {
              ...r,
              commits,
              seenShas: new Set(commits.map((c) => c.sha)),
              lastChecked: new Date().toISOString(),
              error: null,
              checking: false,
              lastNewCount: newOnes.length,
            };
          })
        );
      } catch (e) {
        setRepos((prev) =>
          prev.map((r) => (r.id === id ? { ...r, error: e.message, checking: false } : r))
        );
      }
    },
    [repos, fetchCommits]
  );

  const removeRepo = (id) => {
    setRepos((prev) => prev.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // auto-poll every 45s for the selected repo, simulating webhook-style "new commit" detection
  useEffect(() => {
    if (!selectedId) return;
    pollRef.current = setInterval(() => {
      checkRepo(selectedId, { silent: true });
    }, 45000);
    return () => clearInterval(pollRef.current);
  }, [selectedId, checkRepo]);

  return (
    <div style={styles.app}>
      <style>{fontImports}</style>
      <div style={styles.shell}>
        {/* ---- left rail: ledger index ---- */}
        <aside style={styles.rail}>
          <div style={styles.railHeader}>
            <div style={styles.brandRow}>
              <BookMarked size={20} strokeWidth={1.75} color={INK} />
              <span style={styles.brandText}>SCIEnT Record Portal</span>
            </div>
            <p style={styles.brandSub}>Repository activity, recorded.</p>
          </div>

          <button style={styles.addBtn} onClick={() => setShowAddModal(true)}>
            <Plus size={15} strokeWidth={2} />
            Register repository
          </button>

          <div style={styles.railList}>
            {repos.length === 0 && (
              <div style={styles.emptyRail}>
                No repositories registered yet. Add one to begin the ledger.
              </div>
            )}
            {repos.map((r, idx) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{
                  ...styles.railItem,
                  ...(selectedId === r.id ? styles.railItemActive : {}),
                }}
              >
                <span style={styles.railIndex}>{String(idx + 1).padStart(2, "0")}</span>
                <span style={styles.railItemBody}>
                  <span style={styles.railItemOwner}>{r.owner}</span>
                  <span style={styles.railItemRepo}>{r.repo}</span>
                </span>
                {r.error ? (
                  <AlertCircle size={14} color={RUST} />
                ) : (
                  <ChevronRight size={14} color={INK_FAINT} />
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* ---- main pane ---- */}
        <main style={styles.main}>
          {!selected && (
            <div style={styles.welcome}>
              <GitCommit size={36} strokeWidth={1.25} color={INK_FAINT} />
              <h1 style={styles.welcomeTitle}>No record selected</h1>
              <p style={styles.welcomeBody}>
                Choose a repository from the ledger index, or register a new one to start
                tracking its commit history.
              </p>
            </div>
          )}

          {selected && (
            <RecordView
              repoState={selected}
              onRefresh={() => checkRepo(selected.id)}
              onRemove={() => removeRepo(selected.id)}
              newlyStamped={newlyStamped}
            />
          )}
        </main>
      </div>

      {showAddModal && (
        <AddRepoModal
          value={addInput}
          onChange={setAddInput}
          onSubmit={addRepo}
          onClose={() => {
            setShowAddModal(false);
            setAddError("");
            setAddInput("");
          }}
          error={addError}
          loading={addLoading}
        />
      )}
    </div>
  );
}

// ---------- record view (main commit log) ----------

function RecordView({ repoState, onRefresh, onRemove, newlyStamped }) {
  const { owner, repo, commits, lastChecked, error, checking, lastNewCount } = repoState;

  return (
    <div style={styles.record}>
      <div style={styles.recordHeader}>
        <div>
          <div style={styles.recordBreadcrumb}>
            <Hash size={12} color={INK_FAINT} />
            <span>RECORD</span>
          </div>
          <h1 style={styles.recordTitle}>
            {owner}
            <span style={styles.recordTitleSlash}>/</span>
            {repo}
          </h1>
          <div style={styles.recordMeta}>
            <Clock size={13} color={INK_FAINT} />
            <span>Last checked {lastChecked ? timeAgo(lastChecked) : "never"}</span>
            {lastNewCount > 0 && (
              <span style={styles.newPill}>+{lastNewCount} new since previous check</span>
            )}
          </div>
        </div>
        <div style={styles.recordActions}>
          <button style={styles.refreshBtn} onClick={onRefresh} disabled={checking}>
            {checking ? (
              <Loader2 size={14} className="spin" style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <RefreshCw size={14} />
            )}
            {checking ? "Checking…" : "Check for commits"}
          </button>
          <button style={styles.removeBtn} onClick={onRemove} title="Remove from ledger">
            <X size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={15} color={RUST} />
          <span>{error}</span>
        </div>
      )}

      <div style={styles.statsRow}>
        <Stat label="Commits on record" value={commits.length} />
        <Stat
          label="Most recent"
          value={commits[0] ? timeAgo(commits[0].date) : "—"}
        />
        <Stat
          label="Latest author"
          value={commits[0] ? commits[0].author : "—"}
        />
      </div>

      <div style={styles.ledgerWrap}>
        <div style={styles.ledgerSpine} />
        {commits.map((c, idx) => (
          <CommitRow
            key={c.sha}
            commit={c}
            index={commits.length - idx}
            isStamping={!!newlyStamped[c.sha]}
          />
        ))}
        {commits.length === 0 && !error && (
          <div style={styles.emptyLedger}>No commits found on this repository's default branch.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.statBox}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function CommitRow({ commit, index, isStamping }) {
  return (
    <div style={{ ...styles.row, ...(isStamping ? styles.rowStamping : {}) }}>
      <div style={styles.rowDot} />
      <div style={styles.rowIndex}>{String(index).padStart(3, "0")}</div>
      <div style={styles.rowMain}>
        <div style={styles.rowMessage}>{commit.message}</div>
        <div style={styles.rowSub}>
          <span style={styles.shaBadge}>
            <GitCommit size={11} />
            {commit.shortSha}
          </span>
          <span style={styles.rowAuthor}>
            <User size={11} />
            {commit.author}
          </span>
          <span style={styles.rowDate} title={formatFullDate(commit.date)}>
            {timeAgo(commit.date)}
          </span>
        </div>
      </div>
      {isStamping && <div style={styles.stampLabel}>NEW</div>}
    </div>
  );
}

// ---------- add repo modal ----------

function AddRepoModal({ value, onChange, onSubmit, onClose, error, loading }) {
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") onSubmit();
    if (e.key === "Escape") onClose();
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Register a repository</h2>
          <button style={styles.modalClose} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p style={styles.modalBody}>
          Enter a public GitHub repository to add it to the ledger. New commits will be
          recorded automatically once it's registered.
        </p>
        <input
          ref={inputRef}
          style={styles.modalInput}
          placeholder="facebook/react or github.com/facebook/react"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {error && (
          <div style={styles.modalError}>
            <AlertCircle size={14} color={RUST} />
            {error}
          </div>
        )}
        <div style={styles.modalActions}>
          <button style={styles.modalCancel} onClick={onClose}>
            Cancel
          </button>
          <button style={styles.modalSubmit} onClick={onSubmit} disabled={loading || !value.trim()}>
            {loading ? "Adding…" : "Add to ledger"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- design tokens ----------

const PAPER = "#F6F4EE";
const PAPER_RAISED = "#FFFFFF";
const INK = "#1C1B19";
const INK_SOFT = "#4A4742";
const INK_FAINT = "#9C968C";
const RULE = "#E2DDD2";
const FOREST = "#0F6B4C";
const RUST = "#A13D2B";
const BRASS = "#B6911F";
const BRASS_BG = "#FBF1D6";

const fontImports = `
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes stampIn {
  0% { transform: scale(2.2) rotate(-8deg); opacity: 0; }
  55% { transform: scale(0.95) rotate(2deg); opacity: 1; }
  75% { transform: scale(1.05) rotate(-1deg); }
  100% { transform: scale(1) rotate(0deg); }
}
@keyframes rowFlash {
  0% { background-color: ${BRASS_BG}; }
  100% { background-color: transparent; }
}
`;

const styles = {
  app: {
    fontFamily: "'Inter', sans-serif",
    background: PAPER,
    color: INK,
    minHeight: "100vh",
    width: "100%",
  },
  shell: {
    display: "flex",
    minHeight: "100vh",
    maxWidth: 1180,
    margin: "0 auto",
  },

  // rail
  rail: {
    width: 260,
    flexShrink: 0,
    borderRight: `1px solid ${RULE}`,
    padding: "28px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  railHeader: { marginBottom: 4 },
  brandRow: { display: "flex", alignItems: "center", gap: 8 },
  brandText: {
    fontFamily: "'Source Serif 4', serif",
    fontWeight: 600,
    fontSize: 18,
    letterSpacing: "-0.01em",
  },
  brandSub: { fontSize: 12.5, color: INK_FAINT, marginTop: 4, lineHeight: 1.4 },
  addBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: INK,
    color: PAPER,
    border: "none",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  railList: { display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" },
  emptyRail: {
    fontSize: 12.5,
    color: INK_FAINT,
    lineHeight: 1.5,
    padding: "12px 4px",
    borderTop: `1px dashed ${RULE}`,
    marginTop: 8,
  },
  railItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    borderRadius: 6,
    padding: "9px 8px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  railItemActive: { background: PAPER_RAISED, boxShadow: `0 0 0 1px ${RULE}` },
  railIndex: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: INK_FAINT,
    width: 18,
  },
  railItemBody: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 },
  railItemOwner: { fontSize: 11, color: INK_FAINT },
  railItemRepo: {
    fontSize: 13.5,
    fontWeight: 500,
    color: INK,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  // main
  main: { flex: 1, padding: "28px 40px", minWidth: 0 },
  welcome: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    height: "70vh",
    gap: 10,
  },
  welcomeTitle: {
    fontFamily: "'Source Serif 4', serif",
    fontSize: 22,
    fontWeight: 600,
    margin: 0,
  },
  welcomeBody: { fontSize: 13.5, color: INK_SOFT, maxWidth: 360, lineHeight: 1.6 },

  record: { display: "flex", flexDirection: "column", gap: 22 },
  recordHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: 18,
    borderBottom: `1px solid ${RULE}`,
  },
  recordBreadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: INK_FAINT,
    marginBottom: 6,
  },
  recordTitle: {
    fontFamily: "'Source Serif 4', serif",
    fontSize: 28,
    fontWeight: 600,
    margin: 0,
    letterSpacing: "-0.01em",
  },
  recordTitleSlash: { color: INK_FAINT, margin: "0 4px" },
  recordMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: INK_FAINT,
    marginTop: 8,
    flexWrap: "wrap",
  },
  newPill: {
    background: BRASS_BG,
    color: "#7A5E12",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 20,
    marginLeft: 4,
  },
  recordActions: { display: "flex", gap: 8, alignItems: "center" },
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    background: PAPER_RAISED,
    border: `1px solid ${RULE}`,
    borderRadius: 6,
    padding: "8px 13px",
    fontSize: 13,
    fontWeight: 500,
    color: INK,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  removeBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: `1px solid ${RULE}`,
    borderRadius: 6,
    width: 34,
    height: 34,
    cursor: "pointer",
    color: INK_FAINT,
  },

  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#FBEAE6",
    color: RUST,
    fontSize: 13,
    padding: "10px 14px",
    borderRadius: 6,
  },

  statsRow: { display: "flex", gap: 14 },
  statBox: {
    flex: 1,
    background: PAPER_RAISED,
    border: `1px solid ${RULE}`,
    borderRadius: 8,
    padding: "14px 16px",
  },
  statValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 18,
    fontWeight: 500,
    color: INK,
  },
  statLabel: { fontSize: 11.5, color: INK_FAINT, marginTop: 4 },

  ledgerWrap: { position: "relative", paddingLeft: 4 },
  ledgerSpine: {
    position: "absolute",
    left: 13,
    top: 6,
    bottom: 6,
    width: 1,
    background: RULE,
  },
  emptyLedger: { fontSize: 13, color: INK_FAINT, padding: "20px 0 20px 30px" },

  row: {
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: "12px 10px 12px 0",
    borderBottom: `1px solid ${RULE}`,
  },
  rowStamping: {
    animation: "rowFlash 2.2s ease-out",
  },
  rowDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: FOREST,
    marginTop: 6,
    marginLeft: 9,
    flexShrink: 0,
    boxShadow: `0 0 0 4px ${PAPER}`,
    zIndex: 1,
  },
  rowIndex: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: INK_FAINT,
    marginTop: 2,
    width: 24,
    flexShrink: 0,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowMessage: {
    fontSize: 14,
    fontWeight: 500,
    color: INK,
    marginBottom: 6,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowSub: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  shaBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11.5,
    background: "#EFEAE0",
    color: INK_SOFT,
    padding: "2px 7px",
    borderRadius: 4,
  },
  rowAuthor: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: INK_SOFT },
  rowDate: { fontSize: 12, color: INK_FAINT },
  stampLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 600,
    color: BRASS,
    border: `1.5px solid ${BRASS}`,
    borderRadius: 4,
    padding: "2px 8px",
    transform: "rotate(-6deg)",
    animation: "stampIn 0.5s ease-out",
    alignSelf: "center",
    letterSpacing: "0.05em",
  },

  // modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(28,27,25,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: 20,
  },
  modalCard: {
    background: PAPER_RAISED,
    borderRadius: 10,
    padding: 26,
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalTitle: {
    fontFamily: "'Source Serif 4', serif",
    fontSize: 19,
    fontWeight: 600,
    margin: 0,
  },
  modalClose: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: INK_FAINT,
    padding: 4,
  },
  modalBody: { fontSize: 13, color: INK_SOFT, lineHeight: 1.55, margin: "10px 0 16px" },
  modalInput: {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${RULE}`,
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 13.5,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    background: PAPER,
  },
  modalError: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: RUST,
    marginTop: 10,
  },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  modalCancel: {
    background: "transparent",
    border: `1px solid ${RULE}`,
    borderRadius: 6,
    padding: "9px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    color: INK_SOFT,
  },
  modalSubmit: {
    background: INK,
    color: PAPER,
    border: "none",
    borderRadius: 6,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
