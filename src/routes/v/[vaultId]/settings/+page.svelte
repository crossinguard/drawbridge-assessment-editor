<script lang="ts">
  import { goto } from '$app/navigation';
  import { activeVault } from '$lib/stores/vault.svelte';
  import { vaultList } from '$lib/stores/vaults.svelte';
  import { plain } from '$lib/stores/plain.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import SaveIndicator from '$lib/components/SaveIndicator.svelte';
  import VocabEditor from '$lib/components/settings/VocabEditor.svelte';
  import CollectionKindsEditor from '$lib/components/settings/CollectionKindsEditor.svelte';
  import StringListEditor from '$lib/components/settings/StringListEditor.svelte';
  import LevelSetsEditor from '$lib/components/settings/LevelSetsEditor.svelte';
  import TagDimensionsEditor from '$lib/components/settings/TagDimensionsEditor.svelte';
  import CustomFieldsEditor from '$lib/components/settings/CustomFieldsEditor.svelte';

  const vault = $derived(activeVault.draft);

  /*
    The autosave trigger.

    `plain()` walks the whole draft, which is what makes this effect depend on every
    nested field — a level's points three objects deep re-runs it just as an edit to
    the vault name does. That deep read is the point, not an accident: without it a
    change inside `config.levelSets` would never reach storage.

    It is also why there is no save button anywhere on this screen.
  */
  $effect(() => {
    const draft = vault;
    if (!draft) return;
    plain(draft);
    activeVault.queueSave();
  });

  let confirmingDelete = $state(false);
  let deleteConfirmation = $state('');

  async function deleteVault() {
    if (!vault || deleteConfirmation !== vault.code) return;
    await vaultList.remove(vault.id);
    activeVault.close();
    await goto('/');
  }
</script>

<svelte:head><title>Settings — {vault?.name ?? 'Drawbridge'}</title></svelte:head>

{#if vault}
  <div class="mx-auto flex max-w-3xl flex-col gap-5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Settings</h1>
        <p class="mt-1 text-sm text-text-muted">
          Everything here is data, not code. Changes save as you type.
        </p>
      </div>
      <SaveIndicator saver={activeVault.saver} />
    </header>

    <Card title="Course">
      <div class="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          {#snippet children({ id })}
            <TextInput {id} bind:value={vault.name} />
          {/snippet}
        </Field>
        <Field label="Code">
          {#snippet children({ id })}
            <TextInput {id} bind:value={vault.code} />
          {/snippet}
        </Field>
        <Field label="Term">
          {#snippet children({ id })}
            <TextInput
              {id}
              bind:value={vault.term}
              placeholder="Fall 2026"
            />
          {/snippet}
        </Field>
      </div>
      <div class="mt-3">
        <Field label="Description">
          {#snippet children({ id })}
            <TextInput {id} multiline bind:value={vault.description} />
          {/snippet}
        </Field>
      </div>
    </Card>

    <Card
      title="Outcome tiers"
      description="Names for each level of the outcome tree, outermost first. These are labels only — the tree can be any depth you build."
    >
      <StringListEditor
        bind:items={vault.config.outcomeTiers}
        label="Tier name"
        placeholder="Evidence Outcome"
        addLabel="Tier"
      />
      <div class="mt-4">
        <Field
          label="Outcome code pattern"
          hint="A regular expression. Codes that do not match are flagged for review, never rejected."
        >
          {#snippet children({ id })}
            <TextInput
              {id}
              bind:value={vault.config.outcomePattern}
              placeholder="^[A-Z]&lbrace;1,4&rbrace;\d+(\.\d+)*$"
            />
          {/snippet}
        </Field>
      </div>
    </Card>

    <Card
      title="Statuses"
      description="The workflow an item or collection moves through. Ordered."
    >
      <VocabEditor
        bind:items={vault.config.statuses}
        addLabel="Status"
        keyHint="Records store the key. Renaming one leaves existing records pointing at the old value, which shows up as a warning rather than breaking anything."
      />
    </Card>

    <Card
      title="Collection kinds"
      description="An item bank, a quiz, an exam and a discussion set are all collections; this is the only thing that distinguishes them, and what it says here is what their editor offers."
    >
      <CollectionKindsEditor bind:items={vault.config.collectionKinds} />
    </Card>

    <Card
      title="Rubric level sets"
      description="Reusable scales for rubric grids. A criterion is worth its best level, never the sum of them."
    >
      <LevelSetsEditor bind:items={vault.config.levelSets} />
    </Card>

    <Card
      title="Tag dimensions"
      description="Free-form axes for classifying items — difficulty, Bloom's level, provenance."
    >
      <TagDimensionsEditor bind:items={vault.config.tagDimensions} />
    </Card>

    <Card
      title="Custom fields"
      description="Extra fields on any entity. Anything Drawbridge does not recognise is preserved untouched through export and import."
    >
      <CustomFieldsEditor bind:items={vault.config.customFields} />
    </Card>

    <Card title="Delete this course">
      {#if confirmingDelete}
        <p class="text-sm text-text">
          This removes the course and every outcome, collection, item and rubric in it.
          There is no undo, and nothing is exported first.
        </p>
        <div class="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Type {vault.code} to confirm">
            {#snippet children({ id })}
              <TextInput {id} bind:value={deleteConfirmation} placeholder={vault.code} />
            {/snippet}
          </Field>
          <Button
            variant="danger"
            disabled={deleteConfirmation !== vault.code}
            onclick={deleteVault}
          >
            Delete permanently
          </Button>
          <Button variant="ghost" onclick={() => (confirmingDelete = false)}>Cancel</Button>
        </div>
      {:else}
        <Button variant="danger" onclick={() => (confirmingDelete = true)}>Delete course…</Button>
      {/if}
    </Card>
  </div>
{/if}
