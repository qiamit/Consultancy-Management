interface AccessDeniedPageProps {
  title?: string
  message: string
  designation?: string
  departmentName?: string
}

export function AccessDeniedPage({
  title = 'Access Denied',
  message,
  designation,
  departmentName,
}: AccessDeniedPageProps) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      {(designation || departmentName) && (
        <p className="text-xs text-muted-foreground">
          {departmentName && (
            <>
              Department: <strong>{departmentName}</strong>
              {designation ? ' · ' : ''}
            </>
          )}
          {designation && (
            <>
              Designation: <strong>{designation}</strong>
            </>
          )}
        </p>
      )}
      <button
        type="button"
        className="text-sm font-medium text-primary hover:underline"
        onClick={() => {
          window.location.href = '/'
        }}
      >
        Go to Dashboard
      </button>
    </div>
  )
}
