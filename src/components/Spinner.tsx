/**
 * Spinner reutilizable.
 *
 * Solo para acciones puntuales del usuario (botones: Actualizar, Generar,
 * Preguntar). Para carga de contenido usamos skeletons, no spinners.
 */
const Spinner = ({
  size = 'w-5 h-5',
  className = '',
}: {
  size?: string;
  className?: string;
}) => (
  <svg
    className={`animate-spin ${size} ${className}`}
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

export default Spinner;
