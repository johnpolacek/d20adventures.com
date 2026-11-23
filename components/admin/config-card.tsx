import { AlertCircle, CheckCircle, XCircle } from "lucide-react"

interface ConfigItem {
  key: string
  description: string
  isMissing?: boolean
}

interface FileToRemove {
  path: string
  description?: string
}

interface ConfigCardProps {
  title: string
  description: string
  configItems: ConfigItem[]
  filesToRemove?: FileToRemove[]
  alternativeTitle?: string
  alternativeDescription?: string
}

// Inline code, styled here since Contact's setup page does not load app/admin/admin.css.
const code = { padding: "1px 5px", border: "1px solid var(--up-line)", borderRadius: 4, background: "var(--up-code)", fontFamily: "var(--up-mono)", fontSize: "0.85em" }

// A feature's setup: which variables it needs and which are missing. It is a box of Ledger (`up-surface`), so it keeps
// the paper's look on a page that wears Ledger, as Admin does, and on one that does not, as Contact's setup does.
export function ConfigCard({
  title,
  description,
  configItems,
  filesToRemove,
  alternativeTitle = "Alternative Option",
  alternativeDescription = "If you don't plan to use this feature, you can remove the following files:",
}: ConfigCardProps) {
  return (
    <section className="up-surface mx-auto w-full max-w-3xl border font-[family-name:var(--up-ui)] text-[15px] leading-normal" style={{ borderColor: "var(--up-line)" }}>
      <h2 className="text-xl font-semibold" style={{ color: "var(--up-strong)" }}>
        {title}
      </h2>
      <p className="mt-1" style={{ color: "var(--up-muted)" }}>
        {description}
      </p>

      <p className="mt-6 text-sm" style={{ color: "var(--up-muted)" }}>
        To enable this functionality, you need to configure the following environment variables in your <code style={code}>.env</code> file:
      </p>
      <div className="mt-4 space-y-3">
        {configItems.map((item) => (
          <div key={item.key} className="grid grid-cols-2 items-start gap-2">
            <div className="flex items-center gap-2" style={{ color: item.isMissing ? "var(--up-bad)" : "var(--up-good)" }}>
              {item.isMissing ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
              <code className="font-mono text-xs font-semibold">{item.key}</code>
            </div>
            <p className="text-sm">{item.description}</p>
          </div>
        ))}
      </div>

      {filesToRemove && filesToRemove.length > 0 && (
        <div className="mt-6 rounded-md border p-4 text-sm" style={{ borderColor: "var(--up-accent-line)", background: "var(--up-slot)", color: "var(--up-slot-text)" }}>
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            {alternativeTitle}
          </p>
          <p className="mt-1">{alternativeDescription}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {filesToRemove.map((file) => (
              <li key={file.path}>
                <code style={code}>{file.path}</code>
                {file.description && <span className="ml-2">- {file.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
