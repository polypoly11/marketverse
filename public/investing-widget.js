const INVESTING_WIDGET_URL =
  "https://sslecal2.investing.com?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&importance=3&features=datepicker,timezone&countries=5&calType=week&timeZone=88&lang=18";

window.INVESTING_WIDGET_URL = INVESTING_WIDGET_URL;

// HTML 로딩이 완료되면 한국어 위젯 주소 적용
document.addEventListener("DOMContentLoaded", () => {
  const iframe = document.getElementById("investing-calendar");

  if (iframe) {
    iframe.src = INVESTING_WIDGET_URL;
  }
});
