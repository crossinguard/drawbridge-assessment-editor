<script lang="ts">
  import type { FieldDef, FieldTarget, FieldType } from '$lib/domain/schema';
  import { FieldTargetSchema, FieldTypeSchema } from '$lib/domain/schema';
  import ListEditor from '$lib/components/ui/ListEditor.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import StringListEditor from './StringListEditor.svelte';

  let { items = $bindable() }: { items: FieldDef[] } = $props();

  // Straight from the schema, so a new field type or target cannot be added to the
  // model and forgotten here.
  const types = FieldTypeSchema.options as readonly FieldType[];
  const targets = FieldTargetSchema.options as readonly FieldTarget[];

  const targetLabels: Record<FieldTarget, string> = {
    item: 'Items',
    collection: 'Collections',
    outcome: 'Outcomes',
    rubric: 'Rubrics'
  };

  function make(): FieldDef {
    return { key: '', label: '', type: 'text', appliesTo: [] };
  }

  function toggleTarget(field: FieldDef, target: FieldTarget, on: boolean) {
    field.appliesTo = on
      ? [...field.appliesTo, target]
      : field.appliesTo.filter((t) => t !== target);
  }

  const select =
    'w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text ' +
    'focus:border-border-strong focus:outline-2 focus:outline-accent';
</script>

<ListEditor
  bind:items
  {make}
  addLabel="Field"
  emptyLabel="No custom fields yet."
  reorderable={false}
>
  {#snippet row({ item })}
    <div class="flex flex-col gap-3">
      <div class="grid gap-2 sm:grid-cols-3">
        <Field label="Key">
          {#snippet children({ id })}
            <TextInput {id} bind:value={item.key} placeholder="reviewedBy" />
          {/snippet}
        </Field>
        <Field label="Label">
          {#snippet children({ id })}
            <TextInput {id} bind:value={item.label} placeholder="Reviewed by" />
          {/snippet}
        </Field>
        <Field label="Type">
          {#snippet children({ id })}
            <select
              {id}
              class={select}
              value={item.type}
              onchange={(event) => (item.type = event.currentTarget.value as FieldType)}
            >
              {#each types as type (type)}
                <option value={type}>{type}</option>
              {/each}
            </select>
          {/snippet}
        </Field>
      </div>

      <fieldset>
        <legend class="mb-1 text-xs font-medium tracking-wide text-text-muted uppercase">
          Applies to
        </legend>
        <div class="flex flex-wrap gap-3">
          {#each targets as target (target)}
            <label class="flex cursor-pointer items-center gap-1.5 text-sm text-text-muted">
              <input
                type="checkbox"
                class="accent-accent"
                checked={item.appliesTo.includes(target)}
                onchange={(event) => toggleTarget(item, target, event.currentTarget.checked)}
              />
              {targetLabels[target]}
            </label>
          {/each}
        </div>
      </fieldset>

      {#if item.type === 'select' || item.type === 'multiselect'}
        <div>
          <p class="mb-1 text-xs font-medium tracking-wide text-text-muted uppercase">Options</p>
          <!--
            A function binding, because `options` is optional on the schema and an
            imported field definition may arrive without it. The getter supplies an
            empty array so the editor always has something to render, without writing
            one into records that never asked for it.
          -->
          <StringListEditor
            bind:items={() => item.options ?? [], (next) => (item.options = next)}
            label="Option"
            placeholder="Needs a second reader"
            addLabel="Option"
          />
        </div>
      {/if}
    </div>
  {/snippet}
</ListEditor>
