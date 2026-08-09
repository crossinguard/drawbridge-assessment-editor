<script lang="ts">
  import type { Vocab } from '$lib/domain/schema';
  import ListEditor from '$lib/components/ui/ListEditor.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';

  interface Props {
    items: Vocab[];
    /** Shown under the first key input. */
    keyHint?: string;
    withColour?: boolean;
    addLabel?: string;
  }

  let { items = $bindable(), keyHint, withColour = true, addLabel = 'Add' }: Props = $props();

  // Annotated, or the literal infers as `{ key: string; label: string }` and the
  // optional `colour` is not there to write to.
  const make = (): Vocab => ({ key: '', label: '' });
</script>

<!--
  Bindings target `item.*` rather than `items[index].*`. The snippet parameter is the
  same rune-proxied object that lives in the array, so mutating it is reactive, and it
  sidesteps having to assert away the `undefined` that indexed access implies.
-->
<ListEditor bind:items {make} {addLabel} emptyLabel="None defined yet.">
  {#snippet row({ item, index })}
    <div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <Field label="Key" hint={index === 0 ? keyHint : undefined}>
        {#snippet children({ id })}
          <TextInput {id} bind:value={item.key} placeholder="drafted" />
        {/snippet}
      </Field>
      <Field label="Label">
        {#snippet children({ id })}
          <TextInput {id} bind:value={item.label} placeholder="Drafted" />
        {/snippet}
      </Field>
      {#if withColour}
        <Field label="Colour">
          {#snippet children({ id })}
            <input
              {id}
              type="color"
              class="h-[34px] w-14 cursor-pointer rounded-md border border-border-subtle bg-surface p-1"
              value={item.colour ?? '#94a3b8'}
              oninput={(event) => (item.colour = event.currentTarget.value)}
            />
          {/snippet}
        </Field>
      {/if}
    </div>
  {/snippet}
</ListEditor>
