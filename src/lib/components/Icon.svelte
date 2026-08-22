<script lang="ts">
	// The technology marks in static/icons/ are monochrome silhouettes authored
	// dark-on-light — several hardcode fill="#1c1f21", the rest default to black
	// — so drawn as-is they vanish on this background. They are rendered as a
	// CSS mask so the colour can be supplied, and the colour supplied is the
	// BRAND's own (see $lib/brand.ts), not a UI accent. Passing no colour falls
	// back to currentColor for the generic UI glyphs that have no brand.
	//
	// Full-colour raster assets (company and certificate logos, the portrait)
	// are NOT routed through here — they render as plain <img> and keep every
	// bit of their own colour.
	let {
		src,
		size = 20,
		color,
		class: klass = ''
	}: { src: string; size?: number; color?: string | null; class?: string } = $props();
</script>

<span
	class="inline-block shrink-0 {klass}"
	style="
		width: {size}px;
		height: {size}px;
		background-color: {color ?? 'currentColor'};
		-webkit-mask: url({src}) center / contain no-repeat;
		mask: url({src}) center / contain no-repeat;
	"
	aria-hidden="true"
></span>
