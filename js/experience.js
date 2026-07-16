(function () {
    const chart = document.getElementById('experience-chart');

    if (!chart) {
        return;
    }

    const toUtcDate = (value) => {
        const parts = value.split('-').map(Number);
        return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    };

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const chartStart = toUtcDate(chart.dataset.start);
    const chartDuration = today.getTime() - chartStart.getTime();
    const percentageAt = (date) => ((date.getTime() - chartStart.getTime()) / chartDuration) * 100;
    const clamp = (value) => Math.min(100, Math.max(0, value));

    chart.querySelectorAll('.experience-bar').forEach((bar) => {
        const itemStart = toUtcDate(bar.dataset.start);
        const itemEnd = bar.dataset.end === 'today' ? today : toUtcDate(bar.dataset.end);
        const left = clamp(percentageAt(itemStart));
        const right = clamp(percentageAt(itemEnd));

        bar.style.setProperty('--bar-left', `${left}%`);
        bar.style.setProperty('--bar-width', `${Math.max(0, right - left)}%`);
    });

    const ticks = document.getElementById('experience-ticks');
    const tickDate = new Date(Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth(), 1));
    const minimumGapFromToday = 45 * 24 * 60 * 60 * 1000;

    const addTick = (date, longLabel, shortLabel, classes = []) => {
        const tick = document.createElement('span');
        const position = clamp(percentageAt(date));
        tick.className = ['experience-tick', ...classes].join(' ');
        tick.style.setProperty('--tick-position', `${position}%`);

        const label = document.createElement('span');
        label.className = 'experience-tick-label';
        label.innerHTML = `<span class="experience-tick-label-long">${longLabel}</span><span class="experience-tick-label-short">${shortLabel}</span>`;
        tick.appendChild(label);
        ticks.appendChild(tick);
    };

    while (tickDate.getTime() < today.getTime()) {
        const gapFromToday = today.getTime() - tickDate.getTime();

        if (gapFromToday >= minimumGapFromToday) {
            const isJuly = tickDate.getUTCMonth() === 6;
            const position = percentageAt(tickDate);
            const classes = [];

            if (isJuly) {
                classes.push('is-july');
            }

            if (position > 86) {
                classes.push('is-near-end');
            }

            addTick(
                tickDate,
                `${isJuly ? 'Jul' : 'Jan'} ${tickDate.getUTCFullYear()}`,
                `${tickDate.getUTCFullYear()}`,
                classes
            );
        }

        tickDate.setUTCMonth(tickDate.getUTCMonth() + 6);
    }

    addTick(today, 'Today', 'Today', ['is-today']);
})();
