import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

const SafeTopCampaignsChart = ({ campaigns = [], height = 220 }) => {
  const chartData = useMemo(() => {
    // Safety checks to prevent rendering issues
    if (!Array.isArray(campaigns) || campaigns.length === 0) {
      return {
        labels: ['No campaigns'],
        datasets: [
          {
            label: 'Sent',
            data: [0],
            backgroundColor: '#5BA150',
          },
          {
            label: 'Opened', 
            data: [0],
            backgroundColor: '#007A33',
          },
          {
            label: '% Opened',
            data: [0],
            backgroundColor: '#000',
            yAxisID: 'y1',
          },
        ],
      };
    }

    // Filter and validate campaign data
    const validCampaigns = campaigns
      .filter(campaign => {
        return campaign && 
               typeof campaign.sent === 'number' && 
               typeof campaign.opened === 'number' && 
               typeof campaign.openRate === 'number' &&
               !isNaN(campaign.sent) &&
               !isNaN(campaign.opened) &&
               !isNaN(campaign.openRate);
      })
      .sort((a, b) => (b.openRate || 0) - (a.openRate || 0))
      .slice(0, 5); // Limit to top 5 to prevent chart overflow

    if (validCampaigns.length === 0) {
      return {
        labels: ['No valid data'],
        datasets: [
          {
            label: 'Sent',
            data: [0],
            backgroundColor: '#5BA150',
          },
          {
            label: 'Opened',
            data: [0], 
            backgroundColor: '#007A33',
          },
          {
            label: '% Opened',
            data: [0],
            backgroundColor: '#000',
            yAxisID: 'y1',
          },
        ],
      };
    }

    // Generate safe chart data
    return {
      labels: validCampaigns.map(c => {
        const name = c.name || c.id || 'Unnamed';
        return name.length > 20 ? name.substring(0, 20) + '...' : name;
      }),
      datasets: [
        {
          label: 'Sent',
          data: validCampaigns.map(c => Math.max(0, c.sent || 0)),
          backgroundColor: '#5BA150',
        },
        {
          label: 'Opened',
          data: validCampaigns.map(c => Math.max(0, c.opened || 0)),
          backgroundColor: '#007A33',
        },
        {
          label: 'Open Rate %',
          data: validCampaigns.map(c => Math.max(0, Math.min(100, c.openRate || 0))),
          backgroundColor: '#004d40',
          yAxisID: 'y1',
        },
      ],
    };
  }, [campaigns]);

  const chartOptions = useMemo(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0, // Disable animations to prevent performance issues
    },
    plugins: {
      legend: { 
        position: 'top', 
        labels: { font: { size: 14 } }
      },
      title: { display: false },
      tooltip: { 
        enabled: true, 
        bodyFont: { size: 14 },
        filter: (tooltipItem) => {
          // Prevent tooltips on invalid data
          return !isNaN(tooltipItem.parsed.x) && isFinite(tooltipItem.parsed.x);
        }
      },
    },
    scales: {
      y: { 
        beginAtZero: true, 
        ticks: { 
          font: { size: 14 },
          maxTicksLimit: 10
        }
      },
      x: { 
        beginAtZero: true,
        ticks: { 
          font: { size: 14 },
          maxTicksLimit: 10
        }
      },
      y1: {
        display: false, // Hide the percentage axis completely
        beginAtZero: true,
        position: 'right',
        grid: { drawOnChartArea: false },
        max: 100,
        min: 0,
      },
    },
    onResize: () => {
      // Prevent resize loops
      return true;
    },
  }), []);

  return (
    <div style={{ height: height + 'px', maxHeight: height + 'px', overflow: 'hidden' }}>
      <Bar 
        data={chartData} 
        options={chartOptions}
        height={height}
      />
    </div>
  );
};

export default SafeTopCampaignsChart;
