import { useEffect, useState } from "react";
import { Database, Table2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { errorMessage } from "../../lib/format.js";

type DatabaseStats = {
  database: {
    name: string;
    sizeBytes: number;
    tableCount: number;
    tables: { physicalName: string; tableName: string; baseName: string | null; workspaceName: string | null; rowCount: number }[];
  };
};

const PAGE_SIZE = 15;

export function AdminDatabaseTab() {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setLoading(true);
    setError("");
    api<DatabaseStats>("/api/admin/stats")
      .then((data) => { setStats(data); setVisibleCount(PAGE_SIZE); })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-page-content"><p className="empty-text">Loading database stats...</p></div>;
  if (error) return <div className="admin-page-content"><p className="empty-text">{error}</p></div>;
  if (!stats) return <div className="admin-page-content" />;

  const sizeGB = stats.database.sizeBytes / (1024 * 1024 * 1024);
  const sizeMB = stats.database.sizeBytes / (1024 * 1024);
  const sizeLabel = sizeGB >= 1 ? `${sizeGB.toFixed(2)} GB` : `${sizeMB.toFixed(1)} MB`;
  const isWarning = stats.database.sizeBytes >= 10 * 1024 * 1024 * 1024;

  return (
    <div className="admin-page-content">
      <div className="admin-section">
        <div className="panel-heading inline-heading">
          <Database size={15} />
          <span>Database overview</span>
        </div>
        <div className="db-stats-grid">
          <div className="db-stat">
            <span className="db-stat-label">Name</span>
            <span className="db-stat-value">{stats.database.name}</span>
          </div>
          <div className="db-stat">
            <span className="db-stat-label">Size</span>
            <span className={`db-stat-value ${isWarning ? "db-stat-warning" : ""}`}>{sizeLabel}</span>
          </div>
          <div className="db-stat">
            <span className="db-stat-label">Data tables</span>
            <span className="db-stat-value">{stats.database.tableCount}</span>
          </div>
        </div>
        {isWarning && (
          <div className="db-warning-banner">
            Database size exceeds 10 GB soft limit. Consider archiving old data.
          </div>
        )}
      </div>
      {stats.database.tables.length > 0 && (
        <div className="admin-section">
          <div className="panel-heading inline-heading">
            <Table2 size={15} />
            <span>Table sizes</span>
          </div>
          <div className="db-table-list">
            <div className="db-table-row db-table-header">
              <span>Workspace → Base → Table</span>
              <span>Rows</span>
            </div>
            {stats.database.tables.slice(0, visibleCount).map((table) => (
              <div className="db-table-row" key={table.physicalName}>
                <div className="db-table-identity">
                  <div className="db-table-path">
                    {[table.workspaceName, table.baseName, table.tableName].filter(Boolean).map((part, index) => (
                      <span key={`${part}:${index}`}>{index > 0 && <b aria-hidden="true">→</b>}<strong>{part}</strong></span>
                    ))}
                  </div>
                  <details className="db-table-technical"><summary>Storage details</summary><code>{table.physicalName}</code></details>
                </div>
                <span>{table.rowCount.toLocaleString()}</span>
              </div>
            ))}
            {visibleCount < stats.database.tables.length && (
              <button
                type="button"
                className="audit-load-more"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Load more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
