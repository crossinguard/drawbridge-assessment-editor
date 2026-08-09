<script lang="ts">
  import type { LevelSet } from '$lib/domain/schema';
  import { newId } from '$lib/domain/ids';
  import ListEditor from '$lib/components/ui/ListEditor.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';

  let { items = $bindable() }: { items: LevelSet[] } = $props();

  function makeSet(): LevelSet {
    return { id: newId(), name: '', levels: [{ id: newId(), name: '', points: 1 }] };
  }
</script>

<ListEditor bind:items make={makeSet} addLabel="Level set" emptyLabel="No level sets yet.">
  {#snippet row({ item })}
    <div class="flex flex-col gap-3">
      <Field label="Level set name">
        {#snippet children({ id })}
          <TextInput {id} bind:value={item.name} placeholder="Four-point" />
        {/snippet}
      </Field>

      <div>
        <p class="mb-1 text-xs font-medium tracking-wide text-text-muted uppercase">
          Levels, best first
        </p>
        <!--
          Order matters here in one direction only. Scoring takes the maximum, so a
          level dragged out of place still scores honestly — but the grid editor reads
          top to bottom, so best-first is what the reader expects.
        -->
        <ListEditor
          bind:items={item.levels}
          make={() => ({ id: newId(), name: '', points: 0 })}
          addLabel="Level"
          emptyLabel="No levels — every criterion using this set would be worth nothing."
        >
          {#snippet row({ item: level })}
            <div class="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <Field label="Name" hideLabel>
                {#snippet children({ id })}
                  <TextInput {id} bind:value={level.name} placeholder="Exemplary" />
                {/snippet}
              </Field>
              <Field label="Points" hideLabel>
                {#snippet children({ id })}
                  <TextInput
                    {id}
                    type="number"
                    step="any"
                    bind:value={level.points}
                    placeholder="4"
                  />
                {/snippet}
              </Field>
            </div>
          {/snippet}
        </ListEditor>
      </div>
    </div>
  {/snippet}
</ListEditor>
