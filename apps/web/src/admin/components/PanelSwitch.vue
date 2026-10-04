<script setup lang="ts">
// Switch track as a real button (focusable, Space/Enter), styled by the handoff `sw__track`.
defineProps<{ checked: boolean; label?: string; labelledby?: string; disabled?: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    class="sw__track"
    role="switch"
    :aria-checked="checked"
    :aria-label="label"
    :aria-labelledby="labelledby"
    :aria-disabled="disabled || undefined"
    @click="!disabled && $emit('toggle')"
  ></button>
</template>
