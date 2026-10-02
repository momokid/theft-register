// Passenger loads its startup file with require(), which can't load an ES module; import() can.
import('./app.js').catch((err) => {
  console.error(err);
  process.exit(1);
});
