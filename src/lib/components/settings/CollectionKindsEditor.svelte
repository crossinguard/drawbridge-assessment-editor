<script lang="ts">
  import { ItemKindSchema, type CollectionKind, type ItemKind } from '$lib/domain/schema';
  import ListEditor from '$lib/components/ui/ListEditor.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import { LABEL } from '$lib/components/ui/styles';

  interface Props {
    items: CollectionKind[];
  }

  let { items = $bindable() }: Props = $props();

  const allKinds = ItemKindSchema.options as readonly ItemKind[];

  /*
    A new kind starts with everything on, matching what an unrecognised kind resolves
    to. Someone adding "lab practical" gets the full editor and switches things off,
    rather than an empty one they have to discover how to populate.
  */
  const make = (): CollectionKind => ({
    key: '',
    label: '',
    itemScoring: true,
    sections: true,
    rubricFirst: false
  });

  /**
   * Absent means "every kind" and `[]` means "none", so the checkboxes cannot write
   * directly: unticking the last box has to leave an empty array rather than falling
   * back to undefined, and ticking every box is not the same as saying nothing. The
   * "Offer every kind" toggle is what moves between the two states, deliberately as
   * its own control rather than a side effect of the boxes.
   */
  function toggleKind(kind: CollectionKind, value: ItemKind, on: boolean) {
    const current = kind.itemKinds ?? allKinds;
    kind.itemKinds = on
      ? allKinds.filter((entry) => current.includes(entry) || entry === value)
      : current.filter((entry) => entry !== value);
  }

  function setAllKinds(kind: CollectionKind, everything: boolean) {
    if (everything) delete kind.itemKinds;
    else kind.itemKinds = [...allKinds];
  }
</script>

<ListEditor bind:items {make} addLabel="Kind" emptyLabel="None defined yet.">
  {#snippet row({ item, index })}
    <div class="flex flex-col gap-3">
      <div class="grid gap-2 sm:grid-cols-2">
        <Field
          label="Key"
          hint={index === 0
            ? 'Collections store the key. Renaming one leaves existing collections pointing at the old value, which shows up as a warning rather than breaking anything.'
            : undefined}
        >
          {#snippet children({ id })}
            <TextInput {id} bind:value={item.key} placeholder="quiz" />
          {/snippet}
        </Field>
        <Field label="Label">
          {#snippet children({ id })}
            <TextInput {id} bind:value={item.label} placeholder="Quiz" />
          {/snippet}
        </Field>
      </div>

      <fieldset class="flex flex-col gap-1.5">
        <legend class={LABEL}>This kind of collection</legend>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={item.itemScoring} class="size-4" />
          Scores its items one by one
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={item.sections} class="size-4" />
          Can be split into sections
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={item.rubricFirst} class="size-4" />
          Is normally scored by one rubric, as a whole
        </label>
      </fieldset>

      <fieldset class="flex flex-col gap-1.5">
        <legend class={LABEL}>Item kinds it offers</legend>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="size-4"
            checked={item.itemKinds === undefined}
            onchange={(event) => setAllKinds(item, event.currentTarget.checked)}
          />
          Offer every kind
        </label>

        {#if item.itemKinds !== undefined}
          <div class="flex flex-wrap gap-x-4 gap-y-1 pl-6">
            {#each allKinds as kind (kind)}
              <label class="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  class="size-4"
                  checked={item.itemKinds.includes(kind)}
                  onchange={(event) => toggleKind(item, kind, event.currentTarget.checked)}
                />
                {kind}
              </label>
            {/each}
          </div>
          {#if item.itemKinds.length === 0}
            <p class="pl-6 text-xs text-text-muted">
              None — this kind holds no items of its own, which is right for something
              scored entirely by one rubric.
            </p>
          {/if}
        {/if}
      </fieldset>
    </div>
  {/snippet}
</ListEditor>
