import Block from "components/services/widget/block";
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";

import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;

  const { data: statsData, error: statsError } = useWidgetAPI(widget, "stats");
  const { data: systemData, error: systemError } = useWidgetAPI(widget, "system");
  const { data: poolsData, error: poolsError } = useWidgetAPI(widget, "pools");

  const error = statsError ?? systemError ?? poolsError;
  if (error) {
    return <Container service={service} error={error} />;
  }

  if (!statsData || !systemData) {
    return (
      <Container service={service}>
        <Block label="ugos.cpu" />
        <Block label="ugos.cpuTemp" />
        <Block label="ugos.memory" />
        <Block label="ugos.uptime" />
      </Container>
    );
  }

  const pools = Array.isArray(poolsData) ? poolsData : [];

  return (
    <>
      <Container service={service}>
        <Block label="ugos.cpu" value={t("common.percent", { value: statsData.cpuPercent })} />
        <Block label="ugos.cpuTemp" value={`${statsData.cpuTemp}°C`} />
        <Block label="ugos.memory" value={t("common.bbytes", { value: statsData.memUsed, maximumFractionDigits: 1 })} />
        <Block label="ugos.uptime" value={t("common.duration", { value: systemData.uptime })} />
      </Container>
      <Container service={service}>
        <Block label="ugos.netTx" value={t("common.bibyterate", { value: statsData.netTx })} />
        <Block label="ugos.netRx" value={t("common.bibyterate", { value: statsData.netRx })} />
        <Block label="ugos.diskRead" value={t("common.bibyterate", { value: statsData.diskRead })} />
        <Block label="ugos.diskWrite" value={t("common.bibyterate", { value: statsData.diskWrite })} />
      </Container>
      {pools.map((pool) => (
        <Container key={pool.name} service={service}>
          <Block label="ugos.pool" value={pool.name} />
          <Block label="ugos.poolHealth" value={pool.health} />
          <Block label="ugos.poolUsed" value={t("common.bbytes", { value: pool.used, maximumFractionDigits: 1 })} />
          <Block label="ugos.poolFree" value={t("common.bbytes", { value: pool.free, maximumFractionDigits: 1 })} />
        </Container>
      ))}
    </>
  );
}
