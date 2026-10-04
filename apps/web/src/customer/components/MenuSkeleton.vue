<template>
  <!-- Skeleton shaped like the main page: category tiles, stall tiles, a rail (handoff Cust-Loading). -->
  <section class="pad mt-6" aria-busy="true" aria-label="در حال بارگذاری منو">
    <span class="el-skel el-skel--title" style="width: 30%"></span>
    <div class="el-cat-grid mt-3">
      <div v-for="i in 8" :key="i">
        <span class="el-skel el-skel--square"></span><span class="el-skel el-skel--line" style="width: 70%; margin: 8px auto 0"></span>
      </div>
    </div>
  </section>
  <section class="pad mt-6" aria-busy="true">
    <span class="el-skel el-skel--title" style="width: 30%"></span>
    <div class="el-stall-grid mt-3">
      <div v-for="i in 4" :key="i">
        <span class="el-skel el-skel--square"></span><span class="el-skel el-skel--line" style="width: 60%; margin: 8px auto 0"></span>
      </div>
    </div>
  </section>
  <section class="mt-7" aria-busy="true" style="padding: 20px 16px 22px; background: var(--surface-sunken); overflow: hidden">
    <span class="el-skel el-skel--title" style="width: 40%"></span>
    <div style="display: flex; gap: 12px; margin-top: 14px; overflow: hidden">
      <div v-for="i in 3" :key="i" style="flex: none; width: var(--food-card-w)">
        <span class="el-skel el-skel--square"></span><span class="el-skel el-skel--line" style="width: 50%; margin-top: 10px"></span
        ><span class="el-skel el-skel--title" style="width: 85%; margin-top: 8px"></span>
      </div>
    </div>
  </section>
</template>
