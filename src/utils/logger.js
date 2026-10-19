import pino from "pino";

const transport = pino.transport({
  targets: [
    // {
    //   target: "pino-pretty",
    //   options: { colorize: true },
    //   level: "info"
      
    // }, 
    {
      target: "pino-roll",
      options: {
        file: "./logs/chat",
        dateFormat: "dd-MM-yyyy",
        extension: ".log",
       // size: "10m",         // Rotates whenever the file reaches 10 MB
        frequency: "daily",  // ALSO rotates daily at midnight (whichever comes first)
        mkdir: true
      },
      level: "info",
      
    }
  ]
});

const logger = pino({ level: "info" }, transport);

export default logger;


// const reqLogger = logger.child({ requestId: "req-abc-123" });

// reqLogger.info("Processing checkout");