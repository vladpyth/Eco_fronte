import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { DateField } from "./DateField";

export type GridCardCol = {
  key: string;
  label: string;
  type?: "text" | "number" | "float" | "bool" | "date";
  readOnly?: boolean;
  multiline?: boolean;
  format?: (row: Record<string, unknown>) => string;
  gridRef?: string;
};

type GridCardModalProps = {
  mode: "create" | "edit";
  title: string;
  draft: Record<string, unknown>;
  columns: GridCardCol[];
  getCellValue: (row: Record<string, unknown>, col: GridCardCol) => string;
  onClose: () => void;
  onDraftChange: (colKey: string, value: string, type?: GridCardCol["type"]) => void;
  onOpenGridRef: (colKey: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
};

export function GridCardModal(props: GridCardModalProps) {
  const {
    mode,
    title,
    draft,
    columns,
    getCellValue,
    onClose,
    onDraftChange,
    onOpenGridRef,
    onSubmit,
    submitting,
  } = props;

  const submitLabel =
    mode === "create"
      ? submitting
        ? "Добавление…"
        : "Добавить"
      : submitting
        ? "Сохранение…"
        : "Сохранить";

  return (
    <div className="modal-overlay object-card-overlay" onClick={onClose}>
      <div
        className="modal-content object-card-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span>{title}</span>
          <button type="button" className="modal-header-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="modal-body object-card-body">
          {columns.map((col) => {
            const v = getCellValue(draft, col);

            if (col.gridRef) {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value object-card-ref">
                    <span className="object-card-display">{v || "—"}</span>
                    <button
                      type="button"
                      className="modal-footer-btn"
                      onClick={() => onOpenGridRef(col.key)}
                    >
                      Справочник
                    </button>
                  </div>
                </div>
              );
            }

            if (col.readOnly || col.format) {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value">
                    <span className="object-card-display">{v || "—"}</span>
                  </div>
                </div>
              );
            }

            if (col.type === "bool") {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value">
                    <select
                      className="filter-select"
                      style={{ width: "100%" }}
                      value={v}
                      onChange={(e) => onDraftChange(col.key, e.target.value, "bool")}
                    >
                      <option value="">—</option>
                      <option value="Да">Да</option>
                      <option value="Нет">Нет</option>
                    </select>
                  </div>
                </div>
              );
            }

            if (col.type === "date") {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value">
                    <DateField
                      value={draft[col.key] ?? v}
                      inputClassName="cell-input-minimal date-field-text"
                      onChange={(iso) => onDraftChange(col.key, iso, "date")}
                    />
                  </div>
                </div>
              );
            }

            if (col.type === "number" || col.type === "float") {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value">
                    <input
                      className="cell-input-minimal"
                      style={{ width: "100%" }}
                      value={v}
                      type="number"
                      step={col.type === "float" ? "any" : undefined}
                      onChange={(e) =>
                        onDraftChange(col.key, e.target.value, col.type)
                      }
                    />
                  </div>
                </div>
              );
            }

            const useMultiline = col.multiline !== false;

            return (
              <div key={col.key} className="object-card-field">
                <label className="object-card-label">{col.label}</label>
                <div className="object-card-value">
                  {useMultiline ? (
                    <AutoResizeTextarea
                      className="cell-textarea object-card-textarea"
                      value={v}
                      minRows={2}
                      onChange={(next) =>
                        onDraftChange(col.key, next, col.type ?? "text")
                      }
                    />
                  ) : (
                    <input
                      className="cell-input-minimal"
                      style={{ width: "100%" }}
                      value={v}
                      type="text"
                      onChange={(e) =>
                        onDraftChange(col.key, e.target.value, col.type ?? "text")
                      }
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="object-card-footer">
          <button type="button" className="modal-footer-btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="object-card-submit"
            disabled={submitting}
            onClick={onSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
