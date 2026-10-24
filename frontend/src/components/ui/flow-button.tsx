import { InteractiveHoverButton, type InteractiveHoverButtonProps } from './interactive-hover-button'

/*
 * The site's call-to-action button. It used to be 21st.dev's FlowButton; it now renders the
 * interactive hover button with the same props (to / href / onClick, variant, size), so every
 * page that uses it changes together. Used for occasional navigation and stage moments, never for
 * controls an officer presses all day.
 */
export type FlowButtonProps = InteractiveHoverButtonProps

export function FlowButton(props: FlowButtonProps) {
  return <InteractiveHoverButton {...props} />
}
