<script lang="ts">
  import ListEditor from '$lib/components/ui/ListEditor.svelte';
  import Field from '$lib/components/ui/Field.svelte';

  interface Props {
    items: string[];
    label: string;
    placeholder?: string;
    addLabel?: string;
    emptyLabel?: string;
  }

  let {
    items = $bindable(),
    label,
    placeholder,
    addLabel = 'Add',
    emptyLabel = 'None defined yet.'
  }: Props = $props();

  const base =
    'w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text ' +
    'placeholder:text-text-muted focus:border-border-strong focus:outline-2 focus:outline-accent';
</script>

<!--
  These are bare strings, so there is no object to mutate — the element has to be
  written back by index, which is why this uses an input handler instead of `bind:`.
-->
<ListEditor bind:items make={() => ''} {addLabel} {emptyLabel}>
  {#snippet row({ item, index })}
    <Field {label} hideLabel>
      {#snippet children({ id })}
        <input
          {id}
          class={base}
          value={item}
          {placeholder}
          oninput={(event) => (items[index] = event.currentTarget.value)}
        />
      {/snippet}
    </Field>
  {/snippet}
</ListEditor>
