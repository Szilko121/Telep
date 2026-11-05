import type React from "react"

interface FieldProps {
  label: string
  children: React.ReactNode
  required?: boolean
}

/**
 * Reusable form field component with label
 */
export function Field({ label, children, required = false }: FieldProps) {
  return (
    <div className="mb-4">
      <label className="label">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
