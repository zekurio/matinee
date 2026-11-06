/**
 * The look every text field and select trigger shares. The border sits one
 * step above the hairlines and the recessed fill gives the field its shape,
 * so it reads as a field without a bright outline. Focus brightens the
 * field's own border and adds a soft halo, instead of drawing a second ring
 * outside it.
 */
export const FIELD_CLASS_NAME =
  "border border-input bg-field transition-[color,background-color,border-color,box-shadow] outline-none hover:border-input-hover focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 motion-reduce:transition-none"
