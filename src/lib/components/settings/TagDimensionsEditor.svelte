<script lang="ts">
  import type { TagDimension } from '$lib/domain/schema';
  import ListEditor from '$lib/components/ui/ListEditor.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import StringListEditor from './StringListEditor.svelte';

  let { items = $bindable() }: { items: TagDimension[] } = $props();

  function make(): TagDimension {
    return { key: '', label: '', values: [], ordered: false };
  }
</script>

<ListEditor bind:items {make} addLabel="Dimension" emptyLabel="No tag dimensions yet.">
  {#snippet row({ item })}
    <div class="flex flex-col gap-3">
      <div class="grid gap-2 sm:grid-cols-2">
        <Field label="Key">
          {#snippet children({ id })}
            <TextInput {id} bind:value={item.key} placeholder="difficulty" />
          {/snippet}
        </Field>
        <Field label="Label">
          {#snippet children({ id })}
            <TextInput {id} bind:value={item.label} placeholder="Difficulty" />
          {/snippet}
        </Field>
      </div>

      <label class="flex w-fit cursor-pointer items-center gap-2 text-sm text-text-muted">
        <input
          type="checkbox"
          class="accent-accent"
          checked={item.ordered}
          onchange={(event) => (item.ordered = event.currentTarget.checked)}
        />
        Values have a meaningful order (easy → hard, rather than a plain set)
      </label>

      <div>
        <p class="mb-1 text-xs font-medium tracking-wide text-text-muted uppercase">Values</p>
        <StringListEditor bind:items={item.values} label="Value" placeholder="moderate" addLabel="Value" />
      </div>
    </div>
  {/snippet}
</ListEditor>
