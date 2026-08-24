<script lang="ts">
	// Sharp-edged toggle, per the design language: 0px radius everywhere except
	// status dots. Reads as a HUD breaker switch rather than an iOS pill.
	//
	// It is a real <button role="switch"> with aria-checked, so it is
	// keyboard-operable and announced correctly — a styled div would be
	// neither.
	let {
		checked = false,
		label,
		disabled = false,
		onchange
	}: {
		checked?: boolean;
		label: string;
		disabled?: boolean;
		onchange?: (next: boolean) => void;
	} = $props();
</script>

<button
	type="submit"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	{disabled}
	onclick={() => onchange?.(!checked)}
	class="group relative inline-flex h-6 w-11 shrink-0 items-center border transition-colors disabled:opacity-40 {checked
		? 'border-primary-container bg-primary-container/20'
		: 'border-outline/50 bg-surface-lowest/60'}"
	style={checked ? 'box-shadow: 0 0 8px rgba(0,220,230,0.35)' : ''}
>
	<span
		class="absolute top-[3px] block h-4 w-4 transition-all {checked
			? 'left-[calc(100%-19px)] bg-primary-container'
			: 'left-[3px] bg-outline'}"
	></span>
	<span class="sr-only">{checked ? 'Visible' : 'Hidden'}</span>
</button>
